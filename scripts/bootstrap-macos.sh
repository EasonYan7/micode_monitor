#!/usr/bin/env sh
set -euo pipefail

echo "[bootstrap-macos] Checking and installing dependencies..."
sh scripts/doctor.sh --install --strict

echo "[bootstrap-macos] Installing npm dependencies..."
npm install

echo "[bootstrap-macos] Done."
echo "Run: npm run tauri:dev"
