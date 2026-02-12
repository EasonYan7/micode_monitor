# MiCodeMonitor (English Guide for Beginners)

[English](README.zh-CN.md) | [中文](README.md)

![MiCodeMonitor](screenshot.png)

MiCodeMonitor is a Tauri desktop app for running MiCode across local workspaces.

## Current Release Policy

- This repository is currently **source-first** for internal testing.
- The GitHub `Release` workflow is paused by default and requires manual confirmation.
- If you are new, follow the quick-start flow below.

## Quick Start (Beginner Path)

### 0. Download Source

1. Open repository: <https://github.com/EasonYan7/micode_monitor>
2. Click `Code` -> `Download ZIP` (or use `git clone`)
3. Enter project folder

### 1. One-command bootstrap (recommended)

macOS:

```bash
npm run bootstrap:mac
npm run tauri:dev
```

Windows (PowerShell):

```powershell
npm run bootstrap:win
npm run tauri:dev:win
```

### 2. If bootstrap fails, run diagnostics

```bash
npm run doctor:strict
```

Auto-install dependencies:

```bash
npm run doctor:install
```

Windows auto-install:

```powershell
npm run doctor:win:install
```

## Build Packages

macOS:

```bash
npm run tauri:build
```

Windows:

```powershell
npm run tauri:build:win
```

Build output: `src-tauri/target/release/bundle/`

## Minimal Onboarding Flow for Teammates

1. Install Node.js (with npm)
2. Install Rust (rustup)
3. Run `npm run bootstrap:mac` or `npm run bootstrap:win`
4. Run `npm run tauri:dev` (Windows: `npm run tauri:dev:win`)

## Files You Should Read First

- Chinese local build guide: `BUILD_LOCAL.zh-CN.md`
- English local build guide: `BUILD_LOCAL.md`
- Migration/change log: `TODO.md`
- Core backend entry: `src-tauri/src/lib.rs`
- ACP/session bridge: `src-tauri/src/backend/app_server.rs`

## FAQ

### Q1: `micode: command not found`

macOS/Linux:

```bash
bash -c "$(curl -fsSL https://cnbj1-fds.api.xiaomi.net/mi-code-public/install.sh)"
```

Windows:

```powershell
powershell -ExecutionPolicy Bypass -Command "iwr -useb https://cnbj1-fds.api.xiaomi.net/mi-code-public/install.ps1 | iex"
```

### Q2: macOS has no `brew`

`npm run doctor:install` will try to install Homebrew automatically.

### Q3: Windows has no `winget`

`npm run doctor:win:install` falls back to `choco` if available.

### Q4: Why not ship a public signed dmg now?

Current phase is source-based internal testing. After workflow stabilizes, a teammate with Apple Developer credentials can handle formal signing/notarization and release.

## Attribution

- This project is derived from [Dimillian/CodexMonitor](https://github.com/Dimillian/CodexMonitor).
- Thanks to the upstream maintainers for the original architecture.
