' =============================================================================
' Cycle World B2B — Invisible Always-On Background Server & Public Tunnel Launcher
' =============================================================================
Option Explicit

Dim objShell, strDir, strServerCmd, strTunnelCmd
Set objShell = CreateObject("WScript.Shell")

strDir = "c:\Users\dkris\OneDrive\Desktop\tcw b2b"
strServerCmd = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & strDir & "\server.ps1"""
strTunnelCmd = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & strDir & "\tunnel-daemon.ps1"""

' Run completely hidden (0 = vbHide) and detached (False = do not wait)
objShell.Run strServerCmd, 0, False
objShell.Run strTunnelCmd, 0, False
