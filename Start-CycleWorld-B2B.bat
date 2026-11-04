@echo off
title Cycle World B2B Wholesale Ordering Portal
echo =====================================================================
echo   CYCLE WORLD (TCW B2B) - WHOLESALE SPARE PARTS ORDERING SYSTEM
echo =====================================================================
echo Launching Cycle World B2B Portal in your default browser...
start "" "%~dp0index.html"
echo.
echo Starting local background HTTP sync server on http://localhost:8090 ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -Port 8090
pause
