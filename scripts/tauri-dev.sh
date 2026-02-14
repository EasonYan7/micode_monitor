#!/usr/bin/env sh
set -euo pipefail

cleanup_port() {
  port="$1"
  if ! command -v lsof >/dev/null 2>&1; then
    return 0
  fi

  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -z "$pids" ]; then
    return 0
  fi

  echo "[tauri-dev] Port $port is busy, stopping stale process(es): $pids"
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  sleep 1

  still_busy="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$still_busy" ]; then
    echo "[tauri-dev] Failed to release port $port. Please close process(es): $still_busy" >&2
    exit 1
  fi
}

if [ "$(uname -s)" = "Darwin" ]; then
  export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$HOME/.cache/micode-target}"
  mkdir -p "$CARGO_TARGET_DIR"
fi

cleanup_port 1420
cleanup_port 1421

if [ "${MICODE_TAURI_NO_WATCH:-1}" = "1" ]; then
  echo "[tauri-dev] Rust watcher disabled (--no-watch). Set MICODE_TAURI_NO_WATCH=0 to enable."
  set -- --no-watch "$@"
fi

exec tauri dev "$@"
