# MiCodeMonitor（中文文档）

[English](README.md) | [中文](README.zh-CN.md)

![MiCodeMonitor](screenshot.png)

MiCodeMonitor 是一个基于 Tauri 的桌面应用，用于在本地多个项目中统一编排与管理 MiCode 智能体会话。

## 来源与引用

- 本项目基于 [Dimillian/CodexMonitor](https://github.com/Dimillian/CodexMonitor) 演进。
- 迁移过程与关键决策记录在 [`TODO.md`](TODO.md)。
- 感谢 CodexMonitor 原作者与维护者提供的基础架构。

## 改造背景

- 对齐 GUI 与 MiCode CLI 行为。
- 提升中文体验与设置稳定性。
- 增强线程历史/工具时间线/Token 使用数据持久化。
- 增加真实使用场景下的项目操作能力（如“清空项目对话记录”）。

## 与原版 CodexMonitor 的差异

| 维度 | CodexMonitor（上游） | MiCodeMonitor（本仓库） |
|---|---|---|
| 运行时 | `codex app-server` | MiCode ACP / app-server 兼容链路 |
| Slash 行为 | 偏 Codex 语义 | 对齐 MiCode CLI（含 `/mcp list`） |
| MCP 可见性 | 依赖运行时返回 | 增加 settings 回退与路由修复 |
| 多语言 | 以英文为主 | 扩展中文覆盖与 i18n 修复 |
| 持久化 | 基线能力 | 增强历史/工具时间线/usage 持久化 |
| Usage 数据源 | 基线 | 读取 MiCode `tmp/*/chats/session-*.json` |
| 工作区动作 | 基线 | 新增“清空对话历史”能力 |

## 一、安装方法

### 一键安装

Mi Code CLI 一键安装已上线（新业务部黄区也适用）：

- MacOS / Linux / WSL / Matrix 实例 / 云端工程机（暂时不可用，正在协调解决），在终端运行以下命令：

```bash
bash -c "$(curl -fsSL https://cnbj1-fds.api.xiaomi.net/mi-code-public/install.sh)"
```

- Windows 系统，在 PowerShell 以管理员身份运行以下命令：

```powershell
powershell -ExecutionPolicy Bypass -Command "iwr -useb https://cnbj1-fds.api.xiaomi.net/mi-code-public/install.ps1 | iex"
```

如果一键安装失败，可以按照原方法（从“其他安装方法”章节开始）重新尝试安装。

## 二、环境要求

- Node.js + npm
- Rust 稳定版工具链
- CMake（部分原生依赖需要）
- MiCode CLI（可在 `PATH` 中找到）
- Git CLI
- `gh`（可选，GitHub 面板相关功能）

如果本机无法识别 MiCode，可先执行：

```bash
npm run doctor
```

## 三、快速开始

```bash
npm install
npm run tauri:dev
```

## 四、打包

### macOS

```bash
npm run tauri:build
```

### Windows

```bash
npm run tauri:build:win
```

产物目录位于：`src-tauri/target/release/bundle/`。

## 五、常用校验命令

```bash
npm run typecheck
npm test
cargo check --manifest-path src-tauri/Cargo.toml
```

## 六、数据与配置路径

- 工作区元数据：应用数据目录 `workspaces.json`
- 应用设置：应用数据目录 `settings.json`
- MiCode Home：通常为 `~/.micode`（部分链路兼容 `~/.codex`）
- 本地线程缓存：工作区 `.micodemonitor/` + MiCode tmp/session 数据

## 七、迁移说明

可从以下位置查看详细实现与迁移内容：

- [`TODO.md`](TODO.md)
- `src-tauri/src/lib.rs`
- `src-tauri/src/bin/codex_monitor_daemon.rs`
- `src-tauri/src/shared/`
- `src/features/`

## 许可

请遵循上游仓库许可证及你自己的分发策略。
