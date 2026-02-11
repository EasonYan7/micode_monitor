#!/usr/bin/env bash
set -euo pipefail

app_path="${1:-src-tauri/target/release/bundle/macos/MiCode Monitor.app}"
identity="${CODESIGN_IDENTITY:-}"
entitlements_path="${ENTITLEMENTS_PATH:-src-tauri/Entitlements.plist}"

if [[ -z "${identity}" ]]; then
  echo "CODESIGN_IDENTITY is required. Example:"
  echo "  CODESIGN_IDENTITY='Developer ID Application: Your Name (TEAMID)' $0"
  exit 1
fi

if [[ ! -d "${app_path}" ]]; then
  echo "App bundle not found: ${app_path}"
  exit 1
fi

codesign_entitlements=()
if [[ -f "${entitlements_path}" ]]; then
  echo "Using entitlements: ${entitlements_path}"
  codesign_entitlements=(--entitlements "${entitlements_path}")
else
  echo "Warning: entitlements file not found at ${entitlements_path}; signing without entitlements."
fi

openssl_prefix=""
if command -v brew >/dev/null 2>&1; then
  openssl_prefix="$(brew --prefix openssl@3 2>/dev/null || true)"
fi
if [[ -z "${openssl_prefix}" ]]; then
  if [[ -d "/opt/homebrew/opt/openssl@3" ]]; then
    openssl_prefix="/opt/homebrew/opt/openssl@3"
  elif [[ -d "/usr/local/opt/openssl@3" ]]; then
    openssl_prefix="/usr/local/opt/openssl@3"
  fi
fi

libgit2_prefix=""
if command -v brew >/dev/null 2>&1; then
  libgit2_prefix="$(brew --prefix libgit2 2>/dev/null || true)"
fi
if [[ -z "${libgit2_prefix}" ]]; then
  if [[ -d "/opt/homebrew/opt/libgit2" ]]; then
    libgit2_prefix="/opt/homebrew/opt/libgit2"
  elif [[ -d "/usr/local/opt/libgit2" ]]; then
    libgit2_prefix="/usr/local/opt/libgit2"
  fi
fi

libssh2_prefix=""
if command -v brew >/dev/null 2>&1; then
  libssh2_prefix="$(brew --prefix libssh2 2>/dev/null || true)"
fi
if [[ -z "${libssh2_prefix}" ]]; then
  if [[ -d "/opt/homebrew/opt/libssh2" ]]; then
    libssh2_prefix="/opt/homebrew/opt/libssh2"
  elif [[ -d "/usr/local/opt/libssh2" ]]; then
    libssh2_prefix="/usr/local/opt/libssh2"
  fi
fi

if [[ -z "${openssl_prefix}" || -z "${libgit2_prefix}" || -z "${libssh2_prefix}" ]]; then
  echo "Required Homebrew dependencies not found."
  echo "  openssl_prefix=${openssl_prefix:-<missing>}"
  echo "  libgit2_prefix=${libgit2_prefix:-<missing>}"
  echo "  libssh2_prefix=${libssh2_prefix:-<missing>}"
  exit 1
fi

libssl="${openssl_prefix}/lib/libssl.3.dylib"
libcrypto="${openssl_prefix}/lib/libcrypto.3.dylib"
libgit2="$(ls "${libgit2_prefix}/lib"/libgit2*.dylib 2>/dev/null | head -n1 || true)"
libssh2="$(ls "${libssh2_prefix}/lib"/libssh2*.dylib 2>/dev/null | head -n1 || true)"
frameworks_dir="${app_path}/Contents/Frameworks"
bin_path="${app_path}/Contents/MacOS/micode-monitor"
daemon_path_primary="${app_path}/Contents/MacOS/codex_monitor_daemon"
daemon_path_legacy="${app_path}/Contents/MacOS/micode_monitor_daemon"

if [[ ! -f "${libssl}" || ! -f "${libcrypto}" || -z "${libgit2}" || -z "${libssh2}" ]]; then
  echo "Required dylibs were not found."
  echo "  libssl=${libssl}"
  echo "  libcrypto=${libcrypto}"
  echo "  libgit2=${libgit2:-<missing>}"
  echo "  libssh2=${libssh2:-<missing>}"
  exit 1
fi

mkdir -p "${frameworks_dir}"
cp -f "${libssl}" "${frameworks_dir}/"
cp -f "${libcrypto}" "${frameworks_dir}/"
cp -f "${libgit2}" "${frameworks_dir}/"
cp -f "${libssh2}" "${frameworks_dir}/"

libgit2_name="$(basename "${libgit2}")"
libssh2_name="$(basename "${libssh2}")"

install_name_tool -id "@rpath/libssl.3.dylib" "${frameworks_dir}/libssl.3.dylib"
install_name_tool -id "@rpath/libcrypto.3.dylib" "${frameworks_dir}/libcrypto.3.dylib"
install_name_tool -id "@rpath/${libgit2_name}" "${frameworks_dir}/${libgit2_name}"
install_name_tool -id "@rpath/${libssh2_name}" "${frameworks_dir}/${libssh2_name}"
for candidate in \
  "${libcrypto}" \
  "/opt/homebrew/opt/openssl@3/lib/libcrypto.3.dylib" \
  "/usr/local/opt/openssl@3/lib/libcrypto.3.dylib" \
  "/opt/homebrew/Cellar/openssl@3/3.6.0/lib/libcrypto.3.dylib" \
  "/usr/local/Cellar/openssl@3/3.6.0/lib/libcrypto.3.dylib"
do
  install_name_tool -change "${candidate}" "@rpath/libcrypto.3.dylib" "${frameworks_dir}/libssl.3.dylib" 2>/dev/null || true
done

for candidate in \
  "${libssl}" \
  "/opt/homebrew/opt/openssl@3/lib/libssl.3.dylib" \
  "/usr/local/opt/openssl@3/lib/libssl.3.dylib"
do
  install_name_tool -change "${candidate}" "@rpath/libssl.3.dylib" "${frameworks_dir}/${libssh2_name}" 2>/dev/null || true
done

for candidate in \
  "${libcrypto}" \
  "/opt/homebrew/opt/openssl@3/lib/libcrypto.3.dylib" \
  "/usr/local/opt/openssl@3/lib/libcrypto.3.dylib"
do
  install_name_tool -change "${candidate}" "@rpath/libcrypto.3.dylib" "${frameworks_dir}/${libssh2_name}" 2>/dev/null || true
done

for candidate in \
  "${libssh2}" \
  "/opt/homebrew/opt/libssh2/lib/${libssh2_name}" \
  "/usr/local/opt/libssh2/lib/${libssh2_name}"
do
  install_name_tool -change "${candidate}" "@rpath/${libssh2_name}" "${frameworks_dir}/${libgit2_name}" 2>/dev/null || true
done

for candidate in \
  "${libssl}" \
  "/opt/homebrew/opt/openssl@3/lib/libssl.3.dylib" \
  "/usr/local/opt/openssl@3/lib/libssl.3.dylib"
do
  install_name_tool -change "${candidate}" "@rpath/libssl.3.dylib" "${bin_path}" 2>/dev/null || true
done

for candidate in \
  "${libcrypto}" \
  "/opt/homebrew/opt/openssl@3/lib/libcrypto.3.dylib" \
  "/usr/local/opt/openssl@3/lib/libcrypto.3.dylib"
do
  install_name_tool -change "${candidate}" "@rpath/libcrypto.3.dylib" "${bin_path}" 2>/dev/null || true
done

for candidate in \
  "${libgit2}" \
  "/opt/homebrew/opt/libgit2/lib/${libgit2_name}" \
  "/usr/local/opt/libgit2/lib/${libgit2_name}"
do
  install_name_tool -change "${candidate}" "@rpath/${libgit2_name}" "${bin_path}" 2>/dev/null || true
done

if ! otool -l "${bin_path}" | { command -v rg >/dev/null 2>&1 && rg -q "@executable_path/../Frameworks" || grep -q "@executable_path/../Frameworks"; }; then
  install_name_tool -add_rpath "@executable_path/../Frameworks" "${bin_path}"
fi

codesign --force --options runtime --timestamp --sign "${identity}" "${frameworks_dir}/libcrypto.3.dylib"
codesign --force --options runtime --timestamp --sign "${identity}" "${frameworks_dir}/libssl.3.dylib"
codesign --force --options runtime --timestamp --sign "${identity}" "${frameworks_dir}/${libssh2_name}"
codesign --force --options runtime --timestamp --sign "${identity}" "${frameworks_dir}/${libgit2_name}"
codesign --force --options runtime --timestamp --sign "${identity}" "${codesign_entitlements[@]}" "${bin_path}"
if [[ -f "${daemon_path_primary}" ]]; then
  codesign --force --options runtime --timestamp --sign "${identity}" "${codesign_entitlements[@]}" "${daemon_path_primary}"
elif [[ -f "${daemon_path_legacy}" ]]; then
  codesign --force --options runtime --timestamp --sign "${identity}" "${codesign_entitlements[@]}" "${daemon_path_legacy}"
fi
codesign --force --options runtime --timestamp --sign "${identity}" "${codesign_entitlements[@]}" "${app_path}"

echo "Bundled OpenSSL dylibs and re-signed ${app_path}"
