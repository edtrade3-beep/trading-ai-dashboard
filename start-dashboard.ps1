$ErrorActionPreference = "Stop"

$projectRoot = "C:\Users\dixie\OneDrive\Documents\New project"
$healthUrl = "http://localhost:3000/api/health"
$appUrl = "http://localhost:3000/axiom-runner/index.html?fresh=31"
$logPath = Join-Path $projectRoot "server-all.log"

Set-Location $projectRoot
Write-Host "Checking server on port 3000..."

$listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $listener) {
  Write-Host "Starting AXIOM dashboard server in background..."
  Start-Process -WindowStyle Minimized -FilePath "cmd.exe" -ArgumentList "/c", "cd /d `"$projectRoot`" && set HTTP_PROXY= && set HTTPS_PROXY= && set ALL_PROXY= && node server.js >> `"$logPath`" 2>&1"
} else {
  Write-Host ("Server already running (PID {0})." -f $listener.OwningProcess)
}

$ready = $false
for ($i = 1; $i -le 25; $i++) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing $healthUrl -TimeoutSec 2
    if ($response.StatusCode -eq 200) {
      $ready = $true
      break
    }
  } catch {
    Start-Sleep -Seconds 1
  }
}

if ($ready) {
  Start-Process $appUrl
  Write-Host "Dashboard opened at $appUrl"
} else {
  Write-Host "Server did not become healthy in time. Check server-all.log"
  exit 1
}
