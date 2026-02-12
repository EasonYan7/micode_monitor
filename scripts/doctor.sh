#!/usr/bin/env sh
set -u

STRICT=0
if [ "${1:-}" = "--strict" ]; then
  STRICT=1
fi

MISSING=""
add_missing() {
  if [ -z "$MISSING" ]; then
    MISSING="$1"
  else
    MISSING="$MISSING $1"
  fi
}

check_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    add_missing "$1"
  fi
}

check_cmd node
check_cmd npm
check_cmd rustc
check_cmd cargo
check_cmd cmake
check_cmd git
check_cmd micode

if [ -z "$MISSING" ]; then
  echo "Doctor: OK"
  exit 0
fi

echo "Doctor: missing dependencies: $MISSING"
echo "Required: node npm rustc cargo cmake git micode"

case "$(uname -s)" in
  Darwin)
    echo "macOS install hints:"
    echo "  brew install node rust cmake git"
    echo "  MiCode: bash -c \"\$(curl -fsSL https://cnbj1-fds.api.xiaomi.net/mi-code-public/install.sh)\""
    ;;
  Linux)
    echo "Linux install hints:"
    echo "  Ubuntu/Debian: sudo apt-get install -y nodejs npm rustc cargo cmake git"
    echo "  Fedora: sudo dnf install -y nodejs npm rust cargo cmake git"
    echo "  Arch: sudo pacman -S nodejs npm rust cmake git"
    echo "  MiCode: bash -c \"\$(curl -fsSL https://cnbj1-fds.api.xiaomi.net/mi-code-public/install.sh)\""
    ;;
  MINGW*|MSYS*|CYGWIN*)
    echo "Windows hints: use npm run doctor:win"
    ;;
  *)
    echo "Install the missing tools with your package manager."
    ;;
esac

if [ "$STRICT" -eq 1 ]; then
  exit 1
fi

exit 0
