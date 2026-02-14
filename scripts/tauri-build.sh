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

set_cargo_target_dir

exec tauri build "$@"
