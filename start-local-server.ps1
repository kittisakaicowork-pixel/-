# Runs the local Node server + a public Cloudflare Quick Tunnel together.
# Close this window (or Ctrl+C) to take the site down again.

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$nodeDir = "$env:LOCALAPPDATA\nodejs-dist\node-v24.20.0-win-x64"
$cloudflaredExe = "$env:LOCALAPPDATA\cloudflared\cloudflared.exe"
$env:Path = "$nodeDir;$env:Path"

Get-Content "$root\.env.local" | ForEach-Object {
  if ($_ -match "^([^=#][^=]*)=(.*)$") {
    [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
  }
}
$port = $env:PORT
if (-not $port) { $port = 3000 }

Write-Host "Starting local server on port $port..." -ForegroundColor Cyan
$serverProc = Start-Process -FilePath "$nodeDir\node.exe" -ArgumentList "server.js" -WorkingDirectory $root -PassThru -WindowStyle Hidden `
  -RedirectStandardOutput "$root\.local-server.log" -RedirectStandardError "$root\.local-server-err.log"

$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    Invoke-WebRequest -Uri "http://localhost:$port" -UseBasicParsing -TimeoutSec 2 | Out-Null
    $ready = $true
    break
  } catch {}
}
if (-not $ready) {
  Write-Host "Server did not start in time. Check .local-server-err.log for details." -ForegroundColor Red
  Stop-Process -Id $serverProc.Id -Force -ErrorAction SilentlyContinue
  exit 1
}
Write-Host "Local server is up: http://localhost:$port" -ForegroundColor Green
Write-Host "Opening public tunnel (this link changes every time you run this script)..." -ForegroundColor Cyan

$ErrorActionPreference = "Continue"
try {
  & $cloudflaredExe tunnel --url "http://localhost:$port" --no-autoupdate 2>&1 | ForEach-Object {
    Write-Host $_
    if ($_ -match "https://[a-zA-Z0-9-]+\.trycloudflare\.com") {
      Write-Host ""
      Write-Host "==================================================" -ForegroundColor Yellow
      Write-Host " PUBLIC LINK: $($matches[0])" -ForegroundColor Yellow
      Write-Host "==================================================" -ForegroundColor Yellow
      Write-Host ""
    }
  }
} finally {
  Write-Host "Shutting down local server..." -ForegroundColor Cyan
  Stop-Process -Id $serverProc.Id -Force -ErrorAction SilentlyContinue
}
