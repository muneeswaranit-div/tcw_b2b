@echo off
title Cycle World B2B Wholesale Ordering Portal
echo =====================================================================
echo   CYCLE WORLD (TCW B2B) - WHOLESALE SPARE PARTS ORDERING SYSTEM
echo =====================================================================
echo Starting the MySQL-backed application server on http://localhost:8090 ...
start "Cycle World B2B Server" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -Port 8090
timeout /t 3 /nobreak >nul
echo Launching Cycle World B2B Portal in your default browser...
start "" "http://localhost:8090/"
