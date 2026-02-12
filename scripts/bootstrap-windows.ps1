$ErrorActionPreference = "Stop"

Write-Host "[bootstrap-windows] Checking and installing dependencies..."
npm run doctor:win:install

Write-Host "[bootstrap-windows] Installing npm dependencies..."
npm install

Write-Host "[bootstrap-windows] Done."
Write-Host "Run: npm run tauri:dev:win"
