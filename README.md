# MiCodeMonitor

[English](README.md) | [中文](README.zh-CN.md)

![MiCodeMonitor](screenshot.png) <img width="1225" height="831" alt="image" src="https://github.com/user-attachments/assets/bb4342a2-c7b0-405c-832f-3e3389ec2435" />


MiCodeMonitor is a Tauri desktop app for orchestrating multiple MiCode agents across local workspaces.

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
