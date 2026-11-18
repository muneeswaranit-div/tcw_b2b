param(
    [int]$Port = 8080
)

$ErrorActionPreference = 'Stop'
$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    throw 'Node.js 18 or newer is required to run the MySQL-backed application.'
}

$env:PORT = [string]$Port
Set-Location $rootDir
& $node.Source (Join-Path $rootDir 'server.js')
exit $LASTEXITCODE
