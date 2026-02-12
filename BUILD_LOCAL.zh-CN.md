# 本地构建指南

当前阶段本项目采用源码分发用于内部测试：

- 默认不自动执行正式签名发布流程。
- 团队成员请从仓库拉代码后本地构建/运行。

## 1. 前置依赖

必须能在终端执行以下命令：

- `node`
- `npm`
- `rustc`
- `cargo`
- `cmake`
- `git`
- `micode`

一键检查：

```bash
npm run doctor:strict
```

自动安装缺失依赖（macOS/Linux）：

```bash
npm run doctor:install
```

## 2. macOS（Apple Silicon）

安装依赖：

```bash
brew install node rust cmake git
bash -c "$(curl -fsSL https://cnbj1-fds.api.xiaomi.net/mi-code-public/install.sh)"
```

开发运行：

```bash
npm install
npm run tauri:dev
```

打包：

```bash
npm run tauri:build
```

产物目录：

- `src-tauri/target/release/bundle/macos/`

## 3. Windows

安装依赖（PowerShell）：

```powershell
winget install OpenJS.NodeJS
winget install Rustlang.Rustup
winget install Kitware.CMake
winget install Git.Git
powershell -ExecutionPolicy Bypass -Command "iwr -useb https://cnbj1-fds.api.xiaomi.net/mi-code-public/install.ps1 | iex"
```

自动安装缺失依赖（Windows）：

```powershell
npm run doctor:win:install
```

开发运行：

```powershell
npm install
npm run tauri:dev:win
```

打包：

```powershell
npm run tauri:build:win
```

产物目录：

- `src-tauri/target/release/bundle/`

## 4. 常见问题

- `Doctor: missing dependencies ...`：
  - 先安装缺失依赖，再执行 `npm run doctor:strict`。
- Tauri/Rust 编译报错：
  - 确认 Rust 工具链已安装，并重开终端。
- 找不到 `micode` 命令：
  - 重新执行 MiCode 安装脚本，并确认 `micode --version` 可用。
