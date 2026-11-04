# =============================================================================
# Cycle World B2B — Independent Background Daemon & Watchdog Service
# =============================================================================
# Runs 100% independently of Anti-Gravity.
# Keeps local B2B server (0.0.0.0:8080) and Cloudflare HTTPS Tunnel active 24/7.
# Auto-heals and auto-restarts if any process terminates.
# =============================================================================

$ErrorActionPreference = 'SilentlyContinue'
$rootDir = 'c:\Users\dkris\OneDrive\Desktop\tcw b2b'
if (-not (Test-Path $rootDir)) {
    $rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}

$serverScript = Join-Path $rootDir 'server.ps1'
$cfExe        = Join-Path $rootDir 'cloudflared.exe'
$cfLog        = Join-Path $rootDir 'cloudflared.log'
$linkFile     = Join-Path $rootDir 'SHAREABLE_WEBSITE_LINK.txt'
$pubLinkFile  = Join-Path $rootDir 'PUBLIC_LINK.txt'

$desktopDir   = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)
$desktopLink  = Join-Path $desktopDir 'CycleWorld B2B Portal.url'
$desktopTxt   = Join-Path $desktopDir 'CycleWorld_Links.txt'

function Update-LinkFiles($url) {
    if (-not $url) { return }

    $infoText = @"
===================================================================
CYCLE WORLD B2B — SHAREABLE WEBSITE ACCESS LINKS
===================================================================

1. Customer / Store Login Link (Share this with customers):
   $url/customer.html

2. Super Admin Portal Link:
   $url/admin.html
   Default Credentials:
   - Admin ID: CW-ADMIN
   - Password:  Admin@123

3. Employee / Billing Portal Link:
   $url/billing.html
   Default Credentials:
   - Login ID: cw.staff
   - Password:  Staff@123

4. Main Portal (All Portals Hub):
   $url/

===================================================================
Status: ACTIVE & RUNNING (Independent Background Service)
Port:   8080 (0.0.0.0:8080)
Tunnel: Cloudflare Managed IPv4 HTTPS
Last Health Check: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
===================================================================
"@

    # 1. Project folder files
    [System.IO.File]::WriteAllText($linkFile, $infoText, [System.Text.Encoding]::UTF8)
    [System.IO.File]::WriteAllText($pubLinkFile, $url, [System.Text.Encoding]::UTF8)

    # 2. Desktop files for instant access
    if (Test-Path $desktopDir) {
        [System.IO.File]::WriteAllText($desktopTxt, $infoText, [System.Text.Encoding]::UTF8)
        
        # Desktop shortcut to Customer portal
        $urlShortcutContent = @"
[InternetShortcut]
URL=$url/customer.html
IconIndex=0
"@
        [System.IO.File]::WriteAllText($desktopLink, $urlShortcutContent, [System.Text.Encoding]::ASCII)
    }
}

function Ensure-ServerRunning {
    $listening = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue
    if (-not $listening) {
        Start-Process -FilePath "powershell.exe" `
            -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$serverScript`" -Port 8080" `
            -WorkingDirectory $rootDir `
            -WindowStyle Hidden
        Start-Sleep -Seconds 3
    }
}

function Get-ActiveTunnelUrl {
    if (Test-Path $cfLog) {
        $logText = Get-Content $cfLog -Raw -ErrorAction SilentlyContinue
        $matches = [regex]::Matches($logText, 'https://[a-zA-Z0-9-]+\.trycloudflare\.com')
        if ($matches.Count -gt 0) {
            return $matches[$matches.Count - 1].Value
        }
    }
    return $null
}

function Ensure-TunnelRunning {
    $cfProc = Get-Process -Name 'cloudflared' -ErrorAction SilentlyContinue
    $currentUrl = Get-ActiveTunnelUrl

    if (-not $cfProc -or -not $currentUrl) {
        if ($cfProc) {
            Stop-Process -Name 'cloudflared' -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
        }
        if (Test-Path $cfLog) {
            Remove-Item $cfLog -Force -ErrorAction SilentlyContinue
        }

        # Start cloudflared with robust IPv4 HTTP/2 parameters
        Start-Process -FilePath $cfExe `
            -ArgumentList "tunnel --url http://127.0.0.1:8080 --edge-ip-version 4 --protocol http2 --no-autoupdate --logfile `"$cfLog`"" `
            -WorkingDirectory $rootDir `
            -WindowStyle Hidden

        # Wait up to 30s for the public URL to register
        for ($i = 0; $i -lt 60; $i++) {
            Start-Sleep -Milliseconds 500
            $currentUrl = Get-ActiveTunnelUrl
            if ($currentUrl) { break }
        }
    }

    if ($currentUrl) {
        Update-LinkFiles $currentUrl
    }
    return $currentUrl
}

# -----------------------------------------------------------------------------
# MAIN SERVICE STARTUP & WATCHDOG LOOP
# -----------------------------------------------------------------------------
Ensure-ServerRunning
$activeUrl = Ensure-TunnelRunning

# Continuous Watchdog Loop: Checks health every 20 seconds
while ($true) {
    Start-Sleep -Seconds 20
    Ensure-ServerRunning
    $cfProc = Get-Process -Name 'cloudflared' -ErrorAction SilentlyContinue
    if (-not $cfProc) {
        $activeUrl = Ensure-TunnelRunning
    }
}
