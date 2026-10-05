#!/usr/bin/env python3
"""
CarbonPrints Company OS - Local Bambu Lab LAN Bridge
=====================================================
Lightweight local HTTP REST & MQTT Bridge for Bambu Lab 3D Printers.
Bridges local TLS MQTT (port 8883) to local HTTP (port 5005) with CORS,
allowing the offline browser-based CarbonPrints web app to receive
real-time telemetry and launch Bambu Studio desktop slicer.

Requirements:
    Python 3.8+
    paho-mqtt (pip install paho-mqtt)

Usage:
    python tools/bambu_bridge.py [--port 5005] [--mock]
"""

import sys
import os
import json
import time
import ssl
import subprocess
import threading
import argparse
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, unquote

try:
    import paho.mqtt.client as mqtt
    PAHO_AVAILABLE = True
except ImportError:
    PAHO_AVAILABLE = False


# Global thread-safe state store for printers
PRINTER_DATA = {}
PRINTER_CLIENTS = {}
STATE_LOCK = threading.Lock()
MOCK_MODE = False


def find_bambu_studio_exe():
    """Finds Bambu Studio executable in common Windows installation paths."""
    candidates = [
        r"C:\Program Files\Bambu Studio\bambu-studio.exe",
        r"C:\Program Files (x86)\Bambu Studio\bambu-studio.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\BambuStudio\bambu-studio.exe"),
        os.path.expandvars(r"%PROGRAMFILES%\Bambu Studio\bambu-studio.exe"),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None


class BambuMqttClient:
    """Manages an MQTT connection to a Bambu Lab printer in LAN Mode."""

    def __init__(self, printer_id, ip, access_code, serial):
        self.printer_id = str(printer_id)
        self.ip = ip
        self.access_code = access_code
        self.serial = serial
        self.client = None
        self.connected = False
        self.running = True
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def _run(self):
        if not PAHO_AVAILABLE:
            print(f"[Bambu] paho-mqtt not installed. Cannot connect to {self.ip}")
            return

        client_id = f"CP_OS_{self.serial[-6:] if len(self.serial) >= 6 else 'Bambu'}_{int(time.time())}"
        try:
            # Handle paho-mqtt v1 and v2 compatibility
            if hasattr(mqtt, 'CallbackAPIVersion'):
                self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1, client_id=client_id, protocol=mqtt.MQTTv311)
            else:
                self.client = mqtt.Client(client_id=client_id, protocol=mqtt.MQTTv311)
        except Exception:
            self.client = mqtt.Client(client_id=client_id)

        self.client.username_pw_set("bblp", self.access_code)

        # Bambu LAN mode uses self-signed TLS
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        self.client.tls_set_context(ctx)
        self.client.tls_insecure_set(True)

        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message

        print(f"[Bambu] Connecting to Printer #{self.printer_id} at {self.ip}:8883 (Serial: {self.serial})...")

        while self.running:
            try:
                self.client.connect(self.ip, 8883, 60)
                self.client.loop_forever()
            except Exception as e:
                with STATE_LOCK:
                    PRINTER_DATA[self.printer_id] = {
                        "online": False,
                        "state": "OFFLINE",
                        "error": f"Connection failed: {str(e)}"
                    }
                time.sleep(5)

    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            self.connected = True
            topic = f"device/{self.serial}/report"
            client.subscribe(topic)
            print(f"[Bambu] Connected to Printer #{self.printer_id} ({self.serial})! Subscribed to {topic}")
            with STATE_LOCK:
                if self.printer_id not in PRINTER_DATA:
                    PRINTER_DATA[self.printer_id] = {"online": True, "state": "IDLE"}
                else:
                    PRINTER_DATA[self.printer_id]["online"] = True
        else:
            print(f"[Bambu] Connection rejected (code {rc}) for #{self.printer_id}. Verify Access Code!")
            with STATE_LOCK:
                PRINTER_DATA[self.printer_id] = {
                    "online": False,
                    "state": "UNAUTHORIZED",
                    "error": f"MQTT connect rejected (code {rc}). Check LAN Access Code."
                }

    def _on_disconnect(self, client, userdata, rc):
        self.connected = False
        print(f"[Bambu] Disconnected from Printer #{self.printer_id} (code {rc})")
        with STATE_LOCK:
            if self.printer_id in PRINTER_DATA:
                PRINTER_DATA[self.printer_id]["online"] = False
                PRINTER_DATA[self.printer_id]["state"] = "OFFLINE"

    def _on_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode('utf-8'))
            print_data = payload.get("print", {})
            if not print_data:
                return

            with STATE_LOCK:
                curr = PRINTER_DATA.get(self.printer_id, {})
                curr["online"] = True

                # Parse temperatures
                if "bed_temper" in print_data:
                    curr["bedTemp"] = float(print_data["bed_temper"])
                if "bed_target_temper" in print_data:
                    curr["bedTarget"] = float(print_data["bed_target_temper"])
                if "nozzle_temper" in print_data:
                    curr["toolTemp"] = float(print_data["nozzle_temper"])
                if "nozzle_target_temper" in print_data:
                    curr["toolTarget"] = float(print_data["nozzle_target_temper"])

                # Parse print progress & state
                if "gcode_state" in print_data:
                    curr["state"] = print_data["gcode_state"]
                if "mc_percent" in print_data:
                    curr["progressPct"] = float(print_data["mc_percent"])
                if "mc_remaining_time" in print_data:
                    curr["timeLeftSec"] = int(print_data["mc_remaining_time"]) * 60

                # Subtask name / file
                if "subtask_name" in print_data and print_data["subtask_name"]:
                    curr["subtaskName"] = print_data["subtask_name"]
                elif "gcode_file" in print_data and print_data["gcode_file"]:
                    curr["subtaskName"] = os.path.basename(print_data["gcode_file"])

                # Layer info
                if "layer_num" in print_data:
                    curr["layerNum"] = int(print_data["layer_num"])
                if "total_layer_num" in print_data:
                    curr["totalLayers"] = int(print_data["total_layer_num"])

                # Finished state check
                curr["isFinished"] = (curr.get("state") == "FINISH" or curr.get("progressPct", 0) >= 100)

                # AMS status
                if "ams" in print_data:
                    ams_units = print_data["ams"].get("ams", [])
                    curr["ams"] = ams_units

                curr["error"] = None
                PRINTER_DATA[self.printer_id] = curr
        except Exception as err:
            print(f"[Bambu] Error parsing telemetry from #{self.printer_id}: {err}")

    def stop(self):
        self.running = False
        if self.client:
            try:
                self.client.disconnect()
            except Exception:
                pass


def update_mock_telemetry():
    """Generates realistic Bambu Lab telemetry when running in demo/mock mode."""
    pct = 42.0
    with STATE_LOCK:
        PRINTER_DATA["mock"] = {
            "online": True,
            "state": "RUNNING",
            "bedTemp": 60.0,
            "bedTarget": 60.0,
            "toolTemp": 220.0,
            "toolTarget": 220.0,
            "progressPct": pct,
            "timeLeftSec": int((100.0 - pct) * 45),
            "subtaskName": "CP_Demo_Bracket.gcode.3mf",
            "fileName": "CP_Demo_Bracket.gcode.3mf",
            "layerNum": int(pct * 3.5),
            "totalLayers": 350,
            "isFinished": False,
            "ams": [
                {"id": "0", "tray": [{"id": "0", "name": "Bambu PLA Basic", "color": "000000FF", "remain": 72}]}
            ],
            "error": None
        }
    while True:
        time.sleep(2)
        with STATE_LOCK:
            pct = round((pct + 1.2) % 100.0, 1)
            time_left = int((100.0 - pct) * 45)
            PRINTER_DATA["mock"] = {
                "online": True,
                "state": "RUNNING" if pct < 99 else "FINISH",
                "bedTemp": 60.0,
                "bedTarget": 60.0,
                "toolTemp": 220.0,
                "toolTarget": 220.0,
                "progressPct": pct,
                "timeLeftSec": time_left,
                "subtaskName": "CP_Demo_Bracket.gcode.3mf",
                "fileName": "CP_Demo_Bracket.gcode.3mf",
                "layerNum": int(pct * 3.5),
                "totalLayers": 350,
                "isFinished": (pct >= 99),
                "ams": [
                    {"id": "0", "tray": [{"id": "0", "name": "Bambu PLA Basic", "color": "000000FF", "remain": 72}]}
                ],
                "error": None
            }


class BridgeHttpHandler(BaseHTTPRequestHandler):
    """HTTP Request Handler providing CORS REST endpoints for CarbonPrints."""

    def _send_cors_headers(self, status=200, content_type="application/json"):
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Requested-With")
        self.send_header("Content-Type", content_type)
        self.end_headers()

    def do_OPTIONS(self):
        self._send_cors_headers(204)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip('/')

        if path == "" or path == "/health":
            resp = {
                "status": "ok",
                "service": "CarbonPrints Bambu Lab Bridge",
                "version": "1.0.0",
                "paho_mqtt": PAHO_AVAILABLE,
                "mock_mode": MOCK_MODE,
                "printers_tracked": list(PRINTER_DATA.keys())
            }
            self._send_cors_headers(200)
            self.wfile.write(json.dumps(resp).encode('utf-8'))
            return

        if path == "/api/printers":
            with STATE_LOCK:
                data = dict(PRINTER_DATA)
            self._send_cors_headers(200)
            self.wfile.write(json.dumps(data).encode('utf-8'))
            return

        if path.startswith("/api/printer/"):
            printer_id = unquote(path[len("/api/printer/"):])
            with STATE_LOCK:
                # Direct match or serial match or fallback to mock
                data = PRINTER_DATA.get(printer_id)
                if not data and MOCK_MODE:
                    data = PRINTER_DATA.get("mock")
                if not data:
                    # Search by serial or first available
                    for k, v in PRINTER_DATA.items():
                        if k == printer_id or v.get("serial") == printer_id:
                            data = v
                            break

            if not data:
                data = {
                    "online": False,
                    "state": "NOT_CONNECTED",
                    "error": f"Printer #{printer_id} not connected to bridge."
                }

            self._send_cors_headers(200)
            self.wfile.write(json.dumps(data).encode('utf-8'))
            return

        self._send_cors_headers(404)
        self.wfile.write(json.dumps({"error": "Endpoint not found"}).encode('utf-8'))

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip('/')

        content_len = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_len) if content_len > 0 else b'{}'
        try:
            req_data = json.loads(body.decode('utf-8'))
        except Exception:
            req_data = {}

        if path == "/api/connect":
            p_id = str(req_data.get("id") or req_data.get("serial") or "1")
            ip = req_data.get("ip")
            code = req_data.get("accessCode")
            serial = req_data.get("serial")

            if not ip or not code or not serial:
                self._send_cors_headers(400)
                self.wfile.write(json.dumps({"error": "ip, accessCode, and serial are required"}).encode('utf-8'))
                return

            if p_id in PRINTER_CLIENTS:
                PRINTER_CLIENTS[p_id].stop()

            client = BambuMqttClient(p_id, ip, code, serial)
            PRINTER_CLIENTS[p_id] = client

            self._send_cors_headers(200)
            self.wfile.write(json.dumps({"status": "connecting", "printer_id": p_id}).encode('utf-8'))
            return

        if path == "/api/open-studio":
            part_name = req_data.get("partName", "Model")
            file_name = req_data.get("fileName", "")

            # Attempt to launch Bambu Studio desktop executable
            exe_path = find_bambu_studio_exe()
            launched = False
            launch_method = None

            if exe_path and os.path.exists(exe_path):
                try:
                    subprocess.Popen([exe_path])
                    launched = True
                    launch_method = exe_path
                except Exception as e:
                    print(f"[Bambu] Could not start exe: {e}")

            if not launched and sys.platform == "win32":
                try:
                    os.startfile(f"bambustudio://open?name={part_name}")
                    launched = True
                    launch_method = "bambustudio:// protocol"
                except Exception as e:
                    print(f"[Bambu] Protocol launch error: {e}")

            self._send_cors_headers(200)
            self.wfile.write(json.dumps({
                "status": "success" if launched else "fallback_to_browser",
                "launched": launched,
                "method": launch_method
            }).encode('utf-8'))
            return

        self._send_cors_headers(404)
        self.wfile.write(json.dumps({"error": "Endpoint not found"}).encode('utf-8'))

    def log_message(self, format, *args):
        # Silence verbose HTTP logging for polling requests
        pass


def main():
    global MOCK_MODE
    parser = argparse.ArgumentParser(description="CarbonPrints Bambu Lab Bridge")
    parser.add_argument("--port", type=int, default=5005, help="HTTP port (default: 5005)")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="HTTP host (default: 127.0.0.1)")
    parser.add_argument("--mock", action="store_true", help="Enable simulated Bambu printer telemetry")
    args = parser.parse_args()

    MOCK_MODE = args.mock

    print("=" * 65)
    print(" 🎋 CarbonPrints Company OS - Bambu Lab Bridge")
    print("=" * 65)
    print(f" Bridge HTTP URL:  http://{args.host}:{args.port}")
    print(f" MQTT Protocol:    TLS Port 8883 (LAN Only Mode)")
    print(f" Bambu Studio Exe: {find_bambu_studio_exe() or 'Not found in standard paths (URL protocol will be used)'}")
    print(f" Mock Telemetry:   {'ENABLED (Simulating active prints)' if MOCK_MODE else 'DISABLED'}")
    print("=" * 65)

    if MOCK_MODE:
        threading.Thread(target=update_mock_telemetry, daemon=True).start()

    server = HTTPServer((args.host, args.port), BridgeHttpHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[Bambu Bridge] Shutting down...")
        for c in PRINTER_CLIENTS.values():
            c.stop()
        server.server_close()
        print("[Bambu Bridge] Stopped.")


if __name__ == "__main__":
    main()
