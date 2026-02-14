# Local Build Guide

This project is currently distributed as source code for internal testing.

- No automatic signed macOS release is enabled by default.
- Team members should build/run locally from this repository.

## 1. Prerequisites

Required commands:

- `node`
- `npm`
- `rustc`
- `cargo`
- `cmake`
- `git`
- `micode`

Quick check:

```bash
npm run doctor:strict
```

Auto-install missing dependencies (macOS/Linux):

```bash
npm run doctor:install
```

One-command bootstrap (dependency install + npm install):

```bash
npm run bootstrap:mac
```

## 2. macOS (Apple Silicon)

Install dependencies:

```bash
brew install node rust cmake git
bash -c "$(curl -fsSL https://cnbj1-fds.api.xiaomi.net/mi-code-public/install.sh)"
```

Build and run:

```bash
npm install
npm run tauri:dev
```

Build package:

```bash
npm run tauri:build
```

Output path:

- `~/.cache/micode-target/release/bundle/macos/` (default)
- Trust the final `Finished 2 bundles at:` lines in build logs

## 3. Windows

Install dependencies (PowerShell):

```powershell
winget install OpenJS.NodeJS
winget install Rustlang.Rustup
winget install Kitware.CMake
winget install Git.Git
powershell -ExecutionPolicy Bypass -Command "iwr -useb https://cnbj1-fds.api.xiaomi.net/mi-code-public/install.ps1 | iex"
```

Auto-install missing dependencies (Windows):

```powershell
npm run doctor:win:install
```

One-command bootstrap (dependency install + npm install):

```powershell
npm run bootstrap:win
```

Build and run:

```powershell
npm install
npm run tauri:dev:win
```

Build package:

```powershell
npm run tauri:build:win
```

Output path:

- `src-tauri/target/release/bundle/`

## 4. Common Issues

- `Doctor: missing dependencies ...`:
  - Install missing commands first, then rerun `npm run doctor:strict`.
- macOS without `brew`:
  - `npm run doctor:install` will try to install Homebrew automatically.
- Windows without `winget`:
  - `npm run doctor:win:install` falls back to `choco` if available.
- Tauri/Rust build errors:
  - Ensure Rust toolchain is installed and shell is restarted.
- MiCode command not found:
  - Re-run MiCode install script and verify `micode --version`.
