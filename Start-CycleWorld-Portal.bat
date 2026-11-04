@echo off
title Starting Cycle World B2B Background Service...
echo ===================================================================
echo Starting Cycle World B2B Background Service...
echo ===================================================================
wscript.exe "c:\Users\dkris\OneDrive\Desktop\tcw b2b\Run-B2B-Daemon-Invisible.vbs"
timeout /t 3 /nobreak >nul
echo.
echo Service started silently in the background!
echo Opening access links file...
if exist "c:\Users\dkris\OneDrive\Desktop\tcw b2b\SHAREABLE_WEBSITE_LINK.txt" (
    type "c:\Users\dkris\OneDrive\Desktop\tcw b2b\SHAREABLE_WEBSITE_LINK.txt"
)
pause
