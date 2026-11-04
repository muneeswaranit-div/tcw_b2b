' =============================================================================
' Cycle World B2B — Silent Detached Service Launcher
' Launches tunnel-daemon.ps1 completely detached with 0 visible windows.
' Survives closing Anti-Gravity and terminal windows.
' =============================================================================
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "c:\Users\dkris\OneDrive\Desktop\tcw b2b"
WshShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""c:\Users\dkris\OneDrive\Desktop\tcw b2b\tunnel-daemon.ps1""", 0, False
