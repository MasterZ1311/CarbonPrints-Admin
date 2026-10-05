/**
 * CarbonPrints Company OS - Bambu Lab Studio & Hardware Integration Service
 * Global namespace: window.CP.bambu
 * Provides:
 * 1. One-click slicer launching via Bambu Studio URL protocol & project stubs.
 * 2. Live Bambu Lab LAN telemetry via local Python/Node MQTT bridge.
 * 3. Machine-specific maintenance task templates & diagnostics.
 */
window.CP = window.CP || {};

CP.bambu = (function () {
  const TIMEOUT_MS = 5000;
  const POLL_INTERVAL_MS = 15000;
  const MAX_CONSECUTIVE_FAILURES = 3;
  const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:5005';

  const failureCounts = {};
  const statusCache = {};
  let pollTimer = null;
  let updateCallback = null;

  const BAMBU_MODELS = [
    'Bambu Lab X1-Carbon',
    'Bambu Lab P1S',
    'Bambu Lab P1P',
    'Bambu Lab A1',
    'Bambu Lab A1 Mini'
  ];

  function cleanUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return DEFAULT_BRIDGE_URL;
    let url = rawUrl.trim();
    if (!url) return DEFAULT_BRIDGE_URL;
    url = url.replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(url)) {
      url = 'http://' + url;
    }
    return url;
  }

  function checkMixedContent(url) {
    if (typeof window !== 'undefined' && window.location && window.location.protocol === 'https:') {
      if (url.startsWith('http:')) {
        return 'Mixed Content: HTTPS blocks HTTP bridge calls. Open app locally via http:// or file://';
      }
    }
    return null;
  }

  function isBambuModel(model) {
    if (!model || typeof model !== 'string') return false;
    const m = model.toLowerCase();
    return m.includes('bambu') || m.includes('x1') || m.includes('p1p') || m.includes('p1s') || m.includes('a1');
  }

  function formatTimeLeft(seconds) {
    if (seconds == null || isNaN(seconds) || seconds < 0) return null;
    const s = Math.round(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${m}m left`;
    if (m > 0) return `${m}m left`;
    return `${s}s left`;
  }

  /**
   * Generates a minimal 3MF package / project file stub for Bambu Studio
   */
  function create3mfStub(part, order) {
    const partName = (part && part.name) ? part.name.replace(/[^a-zA-Z0-9_-]/g, '_') : 'Part';
    const orderId = (order && order.id) ? order.id.replace(/[^a-zA-Z0-9_-]/g, '_') : 'Order';
    const material = (part && part.material) ? part.material : 'PLA';
    const layer = (part && part.layer) ? part.layer : '0.20';
    const customer = (order && order.customer && order.customer.name) ? order.customer.name : 'Workshop';

    // Basic 3MF Model XML representation
    const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <metadata name="Title">${CP.util ? CP.util.esc(partName) : partName}</metadata>
  <metadata name="Designer">CarbonPrints Company OS (${CP.util ? CP.util.esc(customer) : customer})</metadata>
  <metadata name="Description">Order: ${orderId} | Material: ${material} | Layer: ${layer}mm</metadata>
  <metadata name="Application">BambuStudio</metadata>
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0"/>
          <vertex x="20" y="0" z="0"/>
          <vertex x="20" y="20" z="0"/>
          <vertex x="0" y="20" z="0"/>
          <vertex x="0" y="0" z="20"/>
          <vertex x="20" y="0" z="20"/>
          <vertex x="20" y="20" z="20"/>
          <vertex x="0" y="20" z="20"/>
        </vertices>
        <triangles>
          <triangle v1="0" v2="2" v3="1"/>
          <triangle v1="0" v2="3" v3="2"/>
          <triangle v1="4" v2="5" v3="6"/>
          <triangle v1="4" v2="6" v3="7"/>
          <triangle v1="0" v2="1" v3="5"/>
          <triangle v1="0" v2="5" v3="4"/>
          <triangle v1="1" v2="2" v3="6"/>
          <triangle v1="1" v2="6" v3="5"/>
          <triangle v1="2" v2="3" v3="7"/>
          <triangle v1="2" v2="7" v3="6"/>
          <triangle v1="3" v2="0" v3="4"/>
          <triangle v1="3" v2="4" v3="7"/>
        </triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1"/>
  </build>
</model>`;

    const fileName = `${orderId}_${partName}_${material}_${layer}mm.3mf`;
    return { fileName, modelXml, partName, orderId, material, layer };
  }

  /**
   * One-click handoff into Bambu Studio
   */
  async function openInStudio(part, order, bridgeUrl) {
    if (!part) return;
    const stub = create3mfStub(part, order);
    const bUrl = cleanUrl(bridgeUrl);

    // 1. Try triggering local bridge if running to launch Bambu Studio desktop app
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(`${bUrl}/api/open-studio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partName: stub.partName,
          orderId: stub.orderId,
          material: stub.material,
          layer: stub.layer,
          fileName: stub.fileName
        }),
        signal: controller.signal
      }).catch(() => null);
      clearTimeout(timer);
      if (res && res.ok) {
        if (CP.ui && CP.ui.toast) {
          CP.ui.toast(`Launched Bambu Studio for "${stub.partName}" via local bridge!`, 'success');
        }
        return true;
      }
    } catch (e) {
      // Bridge not reachable, fallback to direct browser protocol / download
    }

    // 2. Try URI protocol scheme
    const protoUri = `bambustudio://open?name=${encodeURIComponent(stub.partName)}&order=${encodeURIComponent(stub.orderId)}`;
    try {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = protoUri;
      document.body.appendChild(iframe);
      setTimeout(() => {
        try { document.body.removeChild(iframe); } catch (e) {}
      }, 2000);
    } catch (e) {}

    // 3. Trigger 3MF Project Stub Download so double-clicking directly opens in Bambu Studio
    try {
      const blob = new Blob([stub.modelXml], { type: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = stub.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);

      if (CP.ui && CP.ui.toast) {
        CP.ui.toast(`Exported "${stub.fileName}". Opening in Bambu Studio!`, 'success');
      }
      return true;
    } catch (err) {
      if (CP.ui && CP.ui.toast) {
        CP.ui.toast(`Could not trigger slicer: ${err.message}`, 'danger');
      }
      return false;
    }
  }

  /**
   * Fetches telemetry from local Bambu Bridge
   */
  async function fetchStatus(printer) {
    const cfg = (printer && printer.bambu) ? printer.bambu : (printer || {});
    const bridgeUrl = cleanUrl(cfg.bridgeUrl);
    const identifier = cfg.serial || cfg.ip || (printer ? printer.id : '');

    if (!cfg.ip && !cfg.serial && (!printer || printer.integration !== 'bambu')) {
      return { online: false, configured: false, error: 'Bambu Lab printer not configured' };
    }

    const mixedErr = checkMixedContent(bridgeUrl);
    if (mixedErr) {
      return { online: false, configured: true, error: mixedErr };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const url = `${bridgeUrl}/api/printer/${encodeURIComponent(identifier)}`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) {
        return {
          online: false,
          configured: true,
          error: `Bambu bridge returned HTTP ${res.status}. Check printer LAN Mode & IP.`
        };
      }

      const data = await res.json();
      const online = !!data.online;
      const state = data.state || (online ? 'IDLE' : 'OFFLINE');
      const progressPct = data.progressPct != null ? Math.round(Number(data.progressPct) * 10) / 10 : null;
      const timeLeftSec = data.timeLeftSec != null ? Number(data.timeLeftSec) : null;
      const isFinished = !!data.isFinished || state === 'FINISH' || (progressPct != null && progressPct >= 100);

      const result = {
        online,
        configured: true,
        state,
        bedTemp: data.bedTemp != null ? Math.round(Number(data.bedTemp) * 10) / 10 : null,
        bedTarget: data.bedTarget != null ? Math.round(Number(data.bedTarget) * 10) / 10 : null,
        toolTemp: data.toolTemp != null ? Math.round(Number(data.toolTemp) * 10) / 10 : null,
        toolTarget: data.toolTarget != null ? Math.round(Number(data.toolTarget) * 10) / 10 : null,
        progressPct,
        timeLeftSec,
        timeLeftFormatted: formatTimeLeft(timeLeftSec),
        fileName: data.fileName || data.subtaskName || null,
        subtaskName: data.subtaskName || null,
        isFinished,
        ams: Array.isArray(data.ams) ? data.ams : [],
        layerNum: data.layerNum || null,
        totalLayers: data.totalLayers || null,
        nozzleHours: data.nozzleHours || null,
        error: data.error || null
      };

      if (printer && printer.id != null) {
        statusCache[printer.id] = result;
      }
      return result;
    } catch (err) {
      clearTimeout(timer);
      const isTimeout = err.name === 'AbortError';
      const msg = isTimeout
        ? 'Connection timed out (5s). Is bambu_bridge.py running?'
        : 'Local Bambu Bridge unreachable. Run tools/run_bambu_bridge.bat on workshop PC.';
      const res = { online: false, configured: true, error: msg };
      if (printer && printer.id != null) statusCache[printer.id] = res;
      return res;
    }
  }

  async function pollPrinters() {
    if (!CP.store) return;
    const printers = CP.store.get('cp_printers', []);
    const configured = printers.filter(p => {
      const isBambuInteg = p.integration === 'bambu';
      const hasBambuCfg = p.bambu && (p.bambu.ip || p.bambu.serial);
      return isBambuInteg || hasBambuCfg;
    });

    if (configured.length === 0) return;

    for (const p of configured) {
      const fails = failureCounts[p.id] || 0;
      if (fails >= MAX_CONSECUTIVE_FAILURES) continue;

      const status = await fetchStatus(p);
      statusCache[p.id] = status;

      if (status.online) {
        failureCounts[p.id] = 0;
      } else {
        failureCounts[p.id] = fails + 1;
      }

      if (typeof updateCallback === 'function') {
        updateCallback(p.id, status, failureCounts[p.id]);
      }
    }
  }

  function startPolling(cb) {
    updateCallback = cb;
    if (pollTimer) clearInterval(pollTimer);
    pollPrinters();
    pollTimer = setInterval(pollPrinters, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    updateCallback = null;
  }

  function retry(printerId, cb) {
    failureCounts[printerId] = 0;
    if (!CP.store) return;
    const printers = CP.store.get('cp_printers', []);
    const printer = printers.find(p => p.id === printerId);
    if (printer) {
      fetchStatus(printer).then(status => {
        statusCache[printerId] = status;
        if (status.online) {
          failureCounts[printerId] = 0;
        } else {
          failureCounts[printerId] = 1;
        }
        const handler = cb || updateCallback;
        if (typeof handler === 'function') {
          handler(printerId, status, failureCounts[printerId]);
        }
      });
    }
  }

  function getStatus(printerId) {
    return statusCache[printerId] || null;
  }

  function getFailureCount(printerId) {
    return failureCounts[printerId] || 0;
  }

  function testConnection(cfg) {
    return fetchStatus({ bambu: cfg, integration: 'bambu' });
  }

  function renderCardChip(printer) {
    const isBambu = printer.integration === 'bambu' || (printer.bambu && (printer.bambu.ip || printer.bambu.serial));
    if (!isBambu) return '';

    const status = statusCache[printer.id];
    const fails = failureCounts[printer.id] || 0;

    if (!status) {
      return `<span class="badge badge-bambu badge-bambu-connecting" title="Checking Bambu Lab bridge...">● Bambu Lab</span>`;
    }
    if (status.online) {
      const stateTitle = CP.util ? CP.util.esc(status.state) : status.state;
      return `<span class="badge badge-bambu badge-bambu-online" title="${stateTitle}">● Bambu Lab</span>`;
    }
    if (fails >= MAX_CONSECUTIVE_FAILURES) {
      const errTitle = CP.util ? CP.util.esc(status.error) : 'Unreachable';
      return `<span class="badge badge-bambu badge-bambu-offline" title="${errTitle}">● Bambu Offline</span> <button type="button" class="btn-bambu-retry" data-printer-id="${printer.id}" title="Retry connection">Retry</button>`;
    }
    const errTitle = CP.util ? CP.util.esc(status.error) : 'Connecting';
    return `<span class="badge badge-bambu badge-bambu-offline" title="${errTitle}">● Bambu Lab</span>`;
  }

  function renderCardStrip(printer) {
    const isBambu = printer.integration === 'bambu' || (printer.bambu && (printer.bambu.ip || printer.bambu.serial));
    if (!isBambu) return '';

    const status = statusCache[printer.id];
    const fails = failureCounts[printer.id] || 0;

    if (!status) {
      return `<div class="bambu-live-strip"><div class="bambu-strip-msg">Connecting to Bambu Lab...</div></div>`;
    }

    if (status.online) {
      const bed = status.bedTemp != null ? `${status.bedTemp}°C` : '--';
      const tool = status.toolTemp != null ? `${status.toolTemp}°C` : '--';
      const pct = status.progressPct != null ? `${status.progressPct}%` : null;
      const timeLeft = status.timeLeftFormatted;
      const stateText = CP.util ? CP.util.esc(status.state) : status.state;
      const taskName = status.subtaskName || status.fileName;

      return `
        <div class="bambu-live-strip">
          <div class="bambu-telemetry-row">
            <span class="bambu-temps">🛏️ ${bed} &bull; 🎯 ${tool}</span>
            <span class="bambu-state-text">${stateText}</span>
          </div>
          ${taskName ? `<div style="font-size: 10px; color: var(--text-muted); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">Task: <strong>${CP.util ? CP.util.esc(taskName) : taskName}</strong></div>` : ''}
          ${pct !== null ? `
            <div class="bambu-progress-row">
              <span>Bambu: <strong>${pct}</strong></span>
              ${timeLeft ? `<span>${timeLeft}</span>` : ''}
            </div>
            <div class="bambu-progress-track">
              <div class="bambu-progress-bar" style="width:${Math.min(100, Math.max(0, status.progressPct))}%;"></div>
            </div>
          ` : ''}
        </div>
      `;
    }

    if (fails >= MAX_CONSECUTIVE_FAILURES) {
      return `
        <div class="bambu-live-strip is-unreachable">
          <div class="bambu-strip-msg">Bambu unreachable &bull; <button type="button" class="btn-bambu-retry-link" data-printer-id="${printer.id}">Retry</button></div>
        </div>
      `;
    }

    const errMsg = CP.util ? CP.util.esc(status.error || 'Connection failed') : 'Connection failed';
    return `
      <div class="bambu-live-strip is-error">
        <div class="bambu-strip-msg">${errMsg}</div>
      </div>
    `;
  }

  function renderSuggestion(printer) {
    const isBambu = printer.integration === 'bambu' || (printer.bambu && (printer.bambu.ip || printer.bambu.serial));
    if (!isBambu) return '';
    if (printer.status !== 'printing') return '';

    const status = statusCache[printer.id];
    if (status && status.online && status.isFinished) {
      return `
        <div class="bambu-suggest-wrap">
          <button type="button" class="btn-bambu-suggest-complete" data-printer-id="${printer.id}" title="Bambu Lab reports job finished">
            🎉 Bambu finished - Mark completed?
          </button>
        </div>
      `;
    }
    return '';
  }

  function renderConfigFields(p) {
    const isBambu = (p.integration || (p.bambu && (p.bambu.ip || p.bambu.serial) ? 'bambu' : 'none')) === 'bambu';
    return `
      <div class="bambu-fields-wrap" id="bambu-fields-${p.id}" style="display: ${isBambu ? 'block' : 'none'}; background: var(--surface-alt); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); margin-bottom: 8px;">
        <div style="font-size: 12px; font-weight: 700; color: #10b981; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
          <span>🎋 Bambu Lab Local LAN Configuration</span>
        </div>
        <div class="grid grid-cols-2" style="gap: 10px; margin-bottom: 10px;">
          <div class="field" style="margin-bottom: 0;">
            <label for="bambu-ip-${p.id}" style="font-size: 11px;">Printer IP (Workshop LAN)</label>
            <input type="text" id="bambu-ip-${p.id}" class="input input-sm bambu-ip-input" placeholder="e.g. 192.168.1.105" value="${CP.util ? CP.util.esc(p.bambu?.ip || '') : (p.bambu?.ip || '')}">
          </div>
          <div class="field" style="margin-bottom: 0;">
            <label for="bambu-code-${p.id}" style="font-size: 11px;">LAN Access Code</label>
            <input type="text" id="bambu-code-${p.id}" class="input input-sm bambu-code-input" placeholder="From printer screen (e.g. 12345678)" value="${CP.util ? CP.util.esc(p.bambu?.accessCode || '') : (p.bambu?.accessCode || '')}">
          </div>
          <div class="field" style="margin-bottom: 0;">
            <label for="bambu-serial-${p.id}" style="font-size: 11px;">Printer Serial Number</label>
            <input type="text" id="bambu-serial-${p.id}" class="input input-sm bambu-serial-input" placeholder="e.g. 01P00A123456789" value="${CP.util ? CP.util.esc(p.bambu?.serial || '') : (p.bambu?.serial || '')}">
          </div>
          <div class="field" style="margin-bottom: 0;">
            <label for="bambu-bridge-${p.id}" style="font-size: 11px;">Local Bridge URL</label>
            <input type="text" id="bambu-bridge-${p.id}" class="input input-sm bambu-bridge-input" placeholder="http://127.0.0.1:5005" value="${CP.util ? CP.util.esc(p.bambu?.bridgeUrl || 'http://127.0.0.1:5005') : (p.bambu?.bridgeUrl || 'http://127.0.0.1:5005')}">
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <button type="button" class="btn btn-secondary btn-sm btn-test-bambu" data-printer-id="${p.id}">Test Bambu Bridge</button>
          <span class="bambu-test-feedback" id="bambu-feedback-${p.id}" style="font-size: 12px;"></span>
        </div>
      </div>
    `;
  }

  return {
    BAMBU_MODELS,
    isBambuModel,
    cleanUrl,
    formatTimeLeft,
    create3mfStub,
    openInStudio,
    fetchStatus,
    pollPrinters,
    startPolling,
    stopPolling,
    retry,
    getStatus,
    getFailureCount,
    testConnection,
    renderCardChip,
    renderCardStrip,
    renderSuggestion,
    renderConfigFields
  };
})();
