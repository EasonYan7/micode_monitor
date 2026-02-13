#!/usr/bin/env sh
set -euo pipefail

if [ "$(uname -s)" = "Darwin" ]; then
  export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$HOME/.cache/micode-target}"
  mkdir -p "$CARGO_TARGET_DIR"
fi

exec tauri dev "$@"
