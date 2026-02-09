# MiCodeMonitor / MiCode 监控台

![MiCodeMonitor](screenshot.png)

MiCodeMonitor is a Tauri desktop app for orchestrating multiple MiCode agents across local workspaces.

MiCodeMonitor 是一个基于 Tauri 的桌面应用，用于在本地多个项目中统一编排与管理 MiCode 智能体会话。

## Origin & Attribution / 来源与引用

- This project is derived from [Dimillian/CodexMonitor](https://github.com/Dimillian/CodexMonitor).
- The codebase was migrated incrementally from Codex-oriented runtime to MiCode-oriented runtime, tracked in [`TODO.md`](TODO.md).
- Credit to the original CodexMonitor maintainers for the architecture and baseline product design.

- 本项目基于 [Dimillian/CodexMonitor](https://github.com/Dimillian/CodexMonitor) 演进。
- 迁移过程采用分阶段替换（从 Codex 运行时迁移到 MiCode 运行时），完整记录见 [`TODO.md`](TODO.md)。
- 感谢 CodexMonitor 原作者与维护者提供的基础架构与产品设计。

## Why This Fork / 改造背景

- Align GUI behavior with MiCode CLI behavior (`/mcp list`, MCP visibility, model/runtime behavior).
- Improve Chinese localization and setting stability for daily usage.
- Improve thread/history/token usage persistence and recovery.
- Add project/workspace operations needed in real usage (e.g. clear project conversation history).

- 对齐 GUI 与 MiCode CLI 行为（如 `/mcp list`、MCP 可见性、模型切换生效）。
- 提升中文体验与设置页稳定性（避免闪回、误触发）。
- 强化线程历史与 Token 使用数据持久化和恢复能力。
- 增加高频项目操作能力（如清空项目对话记录）。

## Compared with CodexMonitor / 与原版 CodexMonitor 的差异

| Area | CodexMonitor (upstream) | MiCodeMonitor (this repo) |
|---|---|---|
| Runtime | `codex app-server` | MiCode ACP / app-server compatibility path |
| Slash behavior | Codex-oriented | MiCode CLI parity (`/mcp list` behavior, fallback logic) |
| MCP visibility | Depends on runtime | Added fallback from settings + routing fixes |
| Language | Mostly English | Extended Chinese UI coverage + i18n fixes |
| Persistence | Baseline thread persistence | Enhanced history/tool timeline/token usage persistence |
| Home usage | Baseline | Reads MiCode `tmp/*/chats/session-*.json` + workspace filtering |
| Workspace actions | Baseline operations | Adds clear project conversation history flow |

## Core Features / 核心功能

- Multi-workspace management with sidebar/home navigation.
- Thread lifecycle management: create/resume/rename/archive/delete.
- MCP-aware conversations and tool timeline display.
- Model selection and runtime switching.
- Local usage dashboard (tokens/time/top models).
- Git/GitHub panels (status, branch, PR/issue related flows).

- 多工作区管理与侧栏/首页联动。
- 对话线程全生命周期管理：新建、恢复、重命名、归档、删除。
- MCP 工具链路可视化（工具调用时间线与详情）。
- 模型选择与运行时切换。
- 本地使用统计看板（Token、时长、热门模型）。
- Git/GitHub 面板能力（状态、分支、PR/Issue 相关流程）。

## Requirements / 环境要求

- Node.js + npm
- Rust stable toolchain
- CMake (required by native dependencies)
- MiCode CLI installed and available in `PATH`
- Git CLI
- `gh` (optional, for GitHub panel workflows)

如果本机无法找到 `micode`，可先运行：

```bash
npm run doctor
```

## Quick Start / 快速开始

```bash
npm install
npm run tauri:dev
```

## Build / 打包

### macOS

```bash
npm run tauri:build
```

### Windows

```bash
npm run tauri:build:win
```

Artifacts are generated under `src-tauri/target/release/bundle/`.

产物目录位于 `src-tauri/target/release/bundle/`。

## Verification Commands / 常用校验命令

```bash
npm run typecheck
npm test
cargo check --manifest-path src-tauri/Cargo.toml
```

## Data & Config Paths / 数据与配置路径

- Workspace metadata: app data `workspaces.json`
- App settings: app data `settings.json`
- MiCode global config/home: typically `~/.micode` (compatible with `~/.codex` fallback in several flows)
- Local thread cache/history: workspace `.micodemonitor/` and MiCode tmp/session data

- 工作区元数据：应用数据目录中的 `workspaces.json`
- 应用设置：应用数据目录中的 `settings.json`
- MiCode 全局目录：通常为 `~/.micode`（部分链路兼容 `~/.codex`）
- 线程历史缓存：工作区 `.micodemonitor/` 与 MiCode 的 tmp/session 数据

## Notes for Migration History / 迁移说明

- Migration milestones and rationale are tracked in [`TODO.md`](TODO.md).
- If you need implementation-level details, start from:
  - `src-tauri/src/lib.rs`
  - `src-tauri/src/bin/codex_monitor_daemon.rs`
  - `src-tauri/src/shared/`
  - `src/features/`

- 迁移里程碑与动机已记录在 [`TODO.md`](TODO.md)。
- 如需查看实现细节，建议从以下目录开始：
  - `src-tauri/src/lib.rs`
  - `src-tauri/src/bin/codex_monitor_daemon.rs`
  - `src-tauri/src/shared/`
  - `src/features/`

## License / 许可

Please follow the upstream repository license and your internal distribution policy.

请遵循上游仓库许可证及你自己的分发策略。
