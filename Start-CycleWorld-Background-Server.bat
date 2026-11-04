@echo off
title Cycle World B2B — Shareable Website Link Launcher
echo Starting Cycle World B2B Background Server and Public HTTPS Tunnel...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tunnel-daemon.ps1"
echo.
if exist "%~dp0SHAREABLE_WEBSITE_LINK.txt" (
    type "%~dp0SHAREABLE_WEBSITE_LINK.txt"
)
echo.
echo Both the server and public shareable link are running in the background
echo (even if Anti-Gravity or this window is closed).
pause
