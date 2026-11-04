@echo off
title Cycle World B2B — Status & Links
cls
echo ===================================================================
echo               CYCLE WORLD B2B SERVICE STATUS
echo ===================================================================
if exist "c:\Users\dkris\OneDrive\Desktop\tcw b2b\SHAREABLE_WEBSITE_LINK.txt" (
    type "c:\Users\dkris\OneDrive\Desktop\tcw b2b\SHAREABLE_WEBSITE_LINK.txt"
) else (
    echo Service link file not found. Starting service now...
    wscript.exe "c:\Users\dkris\OneDrive\Desktop\tcw b2b\Run-B2B-Daemon-Invisible.vbs"
)
echo.
pause
