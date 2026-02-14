#!/usr/bin/env sh
set -euo pipefail

set_cargo_target_dir() {
  os="$(uname -s)"
  case "$os" in
    Darwin|Linux)
      cache_root="${XDG_CACHE_HOME:-$HOME/.cache}"
      export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$cache_root/micode-target}"
      mkdir -p "$CARGO_TARGET_DIR"
      ;;
  esac
}

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
    echo "[tauri-dev] Port $port still busy, force killing process(es): $still_busy"
    # shellcheck disable=SC2086
    kill -9 $still_busy 2>/dev/null || true
    sleep 1
  fi

  final_busy="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$final_busy" ]; then
    echo "[tauri-dev] Failed to release port $port. Please close process(es): $final_busy" >&2
    exit 1
  fi
}

set_cargo_target_dir

cleanup_port 1420
cleanup_port 1421

if [ "${MICODE_TAURI_NO_WATCH:-1}" = "1" ]; then
  echo "[tauri-dev] Rust watcher disabled (--no-watch). Set MICODE_TAURI_NO_WATCH=0 to enable."
  set -- --no-watch "$@"
fi

exec tauri dev "$@"
