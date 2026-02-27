#!/usr/bin/env sh
set -u

STRICT=0
INSTALL=0
SKIP_MICODE=0

case "${MICODE_DOCTOR_SKIP_MICODE:-0}" in
  1|true|TRUE|yes|YES)
    SKIP_MICODE=1
    ;;
esac

for arg in "$@"; do
  case "$arg" in
    --strict)
      STRICT=1
      ;;
    --install)
      INSTALL=1
      ;;
  esac
done

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
if [ "$SKIP_MICODE" -eq 0 ]; then
  check_cmd micode
fi

REQUIRED_TOOLS="node npm rustc cargo cmake git"
if [ "$SKIP_MICODE" -eq 0 ]; then
  REQUIRED_TOOLS="$REQUIRED_TOOLS micode"
fi

if [ -z "$MISSING" ]; then
  echo "Doctor: OK"
  exit 0
fi

echo "Doctor: missing dependencies: $MISSING"
echo "Required: $REQUIRED_TOOLS"
if [ "$SKIP_MICODE" -eq 1 ]; then
  echo "Doctor: MICODE_DOCTOR_SKIP_MICODE=1, skipping micode check."
fi

install_micode_unix() {
  if command -v micode >/dev/null 2>&1; then
    return 0
  fi
  echo "Installing MiCode CLI..."
  sh -c "$(curl -fsSL https://cnbj1-fds.api.xiaomi.net/mi-code-public/install.sh)"
}

install_homebrew_if_missing() {
  if command -v brew >/dev/null 2>&1; then
    return 0
  fi
  if ! command -v curl >/dev/null 2>&1; then
    echo "Auto-install failed: curl is required to install Homebrew."
    return 1
  fi
  echo "Homebrew not found. Installing Homebrew first..."
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" || return 1
  if [ -x /opt/homebrew/bin/brew ]; then
    PATH="/opt/homebrew/bin:$PATH"
  elif [ -x /usr/local/bin/brew ]; then
    PATH="/usr/local/bin:$PATH"
  fi
  export PATH
  command -v brew >/dev/null 2>&1
}

if [ "$INSTALL" -eq 1 ]; then
  case "$(uname -s)" in
    Darwin)
      install_homebrew_if_missing || {
        echo "Auto-install failed: Homebrew install did not complete."
        exit 1
      }
      base_pkgs=""
      if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
        base_pkgs="$base_pkgs node"
      fi
      if ! command -v rustc >/dev/null 2>&1 || ! command -v cargo >/dev/null 2>&1; then
        base_pkgs="$base_pkgs rust"
      fi
      if ! command -v cmake >/dev/null 2>&1; then
        base_pkgs="$base_pkgs cmake"
      fi
      if ! command -v git >/dev/null 2>&1; then
        base_pkgs="$base_pkgs git"
      fi
      if [ -n "$base_pkgs" ]; then
        # shellcheck disable=SC2086
        brew install $base_pkgs
      fi
      if [ "$SKIP_MICODE" -eq 0 ]; then
        install_micode_unix
      fi
      ;;
    Linux)
      if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update
        sudo apt-get install -y nodejs npm rustc cargo cmake git
      elif command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y nodejs npm rust cargo cmake git
      elif command -v pacman >/dev/null 2>&1; then
        sudo pacman -Sy --noconfirm nodejs npm rust cmake git
      else
        echo "Auto-install failed: unsupported Linux package manager."
        exit 1
      fi
      if [ "$SKIP_MICODE" -eq 0 ]; then
        install_micode_unix
      fi
      ;;
    *)
      echo "Auto-install is only supported on macOS/Linux in this script."
      echo "Windows: use npm run doctor:win:install"
      exit 1
      ;;
  esac

  # Re-check after installation.
  if [ "$STRICT" -eq 1 ]; then
    exec "$0" --strict
  else
    exec "$0"
  fi
fi

case "$(uname -s)" in
  Darwin)
    echo "macOS install hints:"
    echo "  brew install node rust cmake git"
    if [ "$SKIP_MICODE" -eq 0 ]; then
      echo "  MiCode: bash -c \"\$(curl -fsSL https://cnbj1-fds.api.xiaomi.net/mi-code-public/install.sh)\""
    fi
    ;;
  Linux)
    echo "Linux install hints:"
    echo "  Ubuntu/Debian: sudo apt-get install -y nodejs npm rustc cargo cmake git"
    echo "  Fedora: sudo dnf install -y nodejs npm rust cargo cmake git"
    echo "  Arch: sudo pacman -S nodejs npm rust cmake git"
    if [ "$SKIP_MICODE" -eq 0 ]; then
      echo "  MiCode: bash -c \"\$(curl -fsSL https://cnbj1-fds.api.xiaomi.net/mi-code-public/install.sh)\""
    fi
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
