# MiCodeMonitor（新手版中文说明）

[English](README.zh-CN.md) | [中文](README.md)

![MiCodeMonitor](screenshot.png)

MiCodeMonitor 是一个基于 Tauri 的桌面应用，用于在本地工作区里使用 MiCode。

## 当前发布策略（先看这个）

- 当前仓库以**源码分发**为主，适合团队内测。
- GitHub `Release` 工作流默认是暂停状态（需要手动确认才会跑正式发布）。
- 如果你是第一次使用，先按下面“快速上手（小白路径）”走。

## 快速上手（小白路径）

### 0. 下载源码

1. 打开仓库主页：<https://github.com/EasonYan7/micode_monitor>
2. 点击 `Code` -> `Download ZIP`（或 `git clone`）
3. 解压后进入项目目录

### 1. 一键安装依赖并启动（推荐）

macOS：

```bash
npm run bootstrap:mac
npm run tauri:dev
# 等价安全写法：npm run tauri dev
```

Windows（PowerShell）：

```powershell
npm run bootstrap:win
npm run tauri:dev:win
```

### 2. 如果一键失败，用这个排查

```bash
npm run doctor:strict
```

自动修复依赖：

```bash
npm run doctor:install
```

Windows 自动修复：

```powershell
npm run doctor:win:install
```

## 打包安装包

macOS：

```bash
npm run tauri:build
# 等价安全写法：npm run tauri build
```

Windows：

```powershell
npm run tauri:build:win
```

产物目录：

- macOS/Linux：`~/.cache/micode-target/release/bundle/`
- Windows：`src-tauri/target/release/bundle/`
- 以构建日志最后输出的 `Finished 2 bundles at:` 为准

## 同事拿到代码后最短流程

1. 安装 Node.js（含 npm）
2. 安装 Rust（rustup）
3. 执行 `npm run bootstrap:mac` 或 `npm run bootstrap:win`
4. 执行 `npm run tauri:dev`（Windows 用 `npm run tauri:dev:win`）

## 需要重点参考的文件

- 新手本地构建：`BUILD_LOCAL.zh-CN.md`
- 英文构建说明：`BUILD_LOCAL.md`
- 迁移与改造记录：`TODO.md`
- 关键后端入口：`src-tauri/src/lib.rs`
- ACP/会话核心：`src-tauri/src/backend/app_server.rs`

## 常见问题

### Q1：报 `micode: command not found`

执行：

```bash
bash -c "$(curl -fsSL https://cnbj1-fds.api.xiaomi.net/mi-code-public/install.sh)"
```

Windows：

```powershell
powershell -ExecutionPolicy Bypass -Command "iwr -useb https://cnbj1-fds.api.xiaomi.net/mi-code-public/install.ps1 | iex"
```

### Q2：macOS 报没有 `brew`

`npm run doctor:install` 会尝试自动安装 Homebrew，然后继续安装依赖。

### Q3：Windows 没有 `winget`

`npm run doctor:win:install` 会自动尝试回退到 `choco`。

### Q4：为什么现在不直接发 dmg 给所有人

因为当前阶段以源码内测为主，等流程稳定后再由有 Apple Developer 账号的同学负责正式签名/公证发布。

## 致谢与来源

- 本项目基于 [Dimillian/CodexMonitor](https://github.com/Dimillian/CodexMonitor) 演进。
- 感谢原项目维护者提供基础架构。
