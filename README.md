# MiCodeMonitor

[English](README.md) | [中文](README.zh-CN.md)

![MiCodeMonitor](screenshot.png) <img width="1225" height="831" alt="image" src="https://github.com/user-attachments/assets/bb4342a2-c7b0-405c-832f-3e3389ec2435" />


MiCodeMonitor is a Tauri desktop app for orchestrating multiple MiCode agents across local workspaces.

## Current Distribution Policy

- This repository currently uses **source-first distribution** for team testing.
- The `Release` workflow is **paused by default** and requires manual confirmation input.
- Use local build instructions: [`BUILD_LOCAL.md`](BUILD_LOCAL.md).

## Origin & Attribution

- This project is derived from [Dimillian/CodexMonitor](https://github.com/Dimillian/CodexMonitor).
- The migration history and rationale are tracked in [`TODO.md`](TODO.md).
- Thanks to the original CodexMonitor maintainers for the architecture baseline.

## Why This Fork

- Align GUI behavior with MiCode CLI behavior.
- Improve Chinese localization and settings stability.
- Improve thread/history/token usage persistence and recovery.
- Add practical project operations (for example: clear project conversation history).

## Key Differences vs Upstream CodexMonitor

| Area | CodexMonitor (upstream) | MiCodeMonitor (this repo) |
|---|---|---|
| Runtime | `codex app-server` | MiCode ACP / app-server compatibility path |
| Slash behavior | Codex-oriented | MiCode CLI parity (`/mcp list`, routing/fallback fixes) |
| MCP visibility | Runtime-only | Added settings fallback + routing fixes |
| Localization | Mostly English | Extended Chinese coverage + i18n fixes |
| Persistence | Baseline | Enhanced history/tool timeline/token usage persistence |
| Usage source | Baseline | Reads MiCode `tmp/*/chats/session-*.json` |
| Workspace actions | Baseline | Adds clear conversation history action |

## What Was Removed / Changed in This Fork

The following adjustments were made on top of the original CodexMonitor behavior:

- Removed legacy/low-value UI entries:
  - Removed sidebar bottom-left account button.
  - Removed `New Clone Agent` flow and related menu/shortcut path.
  - Simplified creation menu naming and semantics (`New Conversation`, `New Worktree Agent`).
- Removed settings items that were confusing for current target users:
  - Removed experimental feature toggles from settings surface.
  - Removed remote backend host/token inputs from settings surface.
- Changed slash behavior to match MiCode CLI expectations:
  - Slash-prefixed input is routed as command-first behavior.
  - `/mcp` and `/mcp list` behavior aligned with CLI, with settings fallback when runtime status is empty.
- Changed localization behavior:
  - Expanded Chinese coverage.
  - Forced date/relative-time rendering by app language (`en-US` / `zh-CN`) instead of system locale.
- Changed data lifecycle behavior:
  - Added “Clear conversation history” at workspace/worktree level.
  - Enhanced thread history/tool timeline/token usage persistence and restoration.

## Requirements

- Node.js + npm
- Rust stable toolchain
- CMake (required by native dependencies)
- MiCode CLI available in `PATH`
- Git CLI
- `gh` (optional, for GitHub panel workflows)

If MiCode is missing from your environment, run:

Mac
``` 
bash -c "$(curl -fsSL https://cnbj1-fds.api.xiaomi.net/mi-code-public/install.sh)"
```

Windows
``` 
powershell -ExecutionPolicy Bypass -Command "iwr -useb https://cnbj1-fds.api.xiaomi.net/mi-code-public/install.ps1 | iex"
``` 

## Quick Start

```bash
npm install
npm run doctor:strict
npm run tauri:dev
```

## Build

### macOS

```bash
npm run tauri:build
```

### Windows

```bash
npm run tauri:build:win
```

Artifacts are generated under `src-tauri/target/release/bundle/`.

### Windows Download (for end users)

Windows builds are produced from branch `windows-main` via GitHub Actions.

1. Open Actions workflow: [Build Windows](https://github.com/EasonYan7/micode_monitor/actions/workflows/build-windows.yml)
2. Filter runs by branch `windows-main`
3. Open the latest successful run and download artifact `windows-bundle-*`

Note: In-app auto-update is currently disabled in this fork. For now, prefer source-based local build/testing.

## Validation Commands

```bash
npm run typecheck
npm test
cargo check --manifest-path src-tauri/Cargo.toml
```

## Data & Config Paths

- Workspace metadata: app data `workspaces.json`
- App settings: app data `settings.json`
- MiCode home: usually `~/.micode` (with compatibility fallback to `~/.codex` in some flows)
- Local thread cache/history: workspace `.micodemonitor/` and MiCode tmp/session data

## Migration Notes

For migration milestones and implementation details, see:

- [`TODO.md`](TODO.md)
- `src-tauri/src/lib.rs`
- `src-tauri/src/bin/codex_monitor_daemon.rs`
- `src-tauri/src/shared/`
- `src/features/`

## License

Please follow the upstream repository license and your internal distribution policy.
