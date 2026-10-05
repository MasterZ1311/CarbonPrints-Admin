@echo off
title CarbonPrints - Bambu Lab Bridge
echo ===================================================
echo   CarbonPrints Company OS - Bambu Lab LAN Bridge
echo ===================================================
echo Starting local bridge on http://127.0.0.1:5005...
echo (Pass --mock to run with simulated printers if testing offline)
echo Press Ctrl+C to stop.
echo.

python "%~dp0bambu_bridge.py" %*
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Bridge exited with error. Make sure Python is installed and paho-mqtt is present:
    echo pip install paho-mqtt
    pause
)
