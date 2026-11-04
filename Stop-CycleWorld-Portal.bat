@echo off
title Stopping Cycle World B2B Service...
echo Stopping Cycle World B2B background server and tunnel...
powershell -Command "Stop-Process -Name 'cloudflared' -Force -ErrorAction SilentlyContinue"
powershell -Command "Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
echo Done! All Cycle World B2B services stopped.
pause
