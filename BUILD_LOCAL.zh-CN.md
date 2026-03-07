# 本地运行与构建指南（Windows 优先）

这份文档给内部同事使用，目标只有一件事：让你在 Windows 上把 MiCodeMonitor 跑起来，并且知道出错时先看哪里。

## 1. 在哪里运行

所有命令都要在仓库根目录执行，不要在 `src-tauri/` 目录里执行。

当前这台机器的仓库根目录示例：

```powershell
C:\Users\mi\Desktop\micode_monitor\micode_monitor
```

进入目录：

```powershell
cd C:\Users\mi\Desktop\micode_monitor\micode_monitor
```

确认你当前就在根目录：

```powershell
Get-Location
```

## 2. 用什么终端

Windows 统一使用 PowerShell。

原因：
- 仓库里的 Windows 脚本、安装命令和排查命令都按 PowerShell 写
- MiCode 官方 Windows 安装命令本身也是 PowerShell 形式
- `where link`、`Get-Location` 这类排查命令直接可用

## 3. 标准启动命令

Windows 上不要直接写 `npm run tauri dev`。

统一使用：

```powershell
npm run tauri:dev:win
```

原因：
- 这个命令会先执行 `doctor:win`
- 再启动 Tauri 开发环境
- 对同事来说最不容易跑偏

## 4. 第一次启动的标准顺序

```powershell
cd C:\你的路径\micode_monitor
npm install
npm run doctor:win
npm run tauri:dev:win
```

如果只是想一键补环境，也可以先执行：

```powershell
npm run bootstrap:win
```

然后再执行：

```powershell
npm run tauri:dev:win
```

## 5. doctor 会检查什么

`npm run doctor:win` 现在会检查这些：

- `node`
- `npm`
- `rustc`
- `cargo`
- `cmake`
- `git`
- `python`
- `micode`
- `link.exe`（Windows Rust/Tauri 本地编译必需）

说明：
- 如果 `link.exe` 已经装在 Visual Studio Build Tools 目录里，但当前 PowerShell 没有把它放进 `PATH`，`doctor:win` 也会识别到
- `npm run tauri:dev:win` 和 `npm run tauri:build:win` 现在会自动导入 Visual Studio 构建环境
- 所以普通 PowerShell 也可以直接启动，不需要你手工切到 Developer PowerShell

为什么要检查 `link.exe`：
- Rust 在 Windows 上默认走 `msvc` 工具链
- `cargo` 最后链接二进制时要调用微软的 `link.exe`
- 没有它，`npm run tauri:dev:win` 会在 Rust 编译到一半时报错
- 这不是 VS Code 缺失，而是 Visual C++ Build Tools 缺失

## 6. 如果 `npm` 都找不到

表现：

```powershell
npm : 无法将“npm”项识别为 cmdlet...
```

这说明 Node.js 没装好，或者没进 PATH。

先执行：

```powershell
winget install OpenJS.NodeJS
```

装完后：
1. 关闭当前 PowerShell
2. 重新打开一个新的 PowerShell
3. 再执行：

```powershell
node -v
npm -v
```

只有这两个都能出版本号，才能继续跑项目命令。

## 7. 如果 `npm install` 卡在 `sync-material-icons`

表现通常像这样：

```powershell
npm error code 3221226505
npm error command failed
npm error command ... npm run sync:material-icons
```

这不是 Tauri 的问题，是安装阶段同步图标资源时崩了。

现在仓库已经修复了 Windows 复制逻辑。如果你遇到这个错误，先确认代码是最新的：

```powershell
git pull
npm install
```

## 8. 如果 `tauri dev` 报 `link.exe not found`

表现通常像这样：

```text
error: linker `link.exe` not found
note: the msvc targets depend on the msvc linker but `link.exe` was not found
```

这说明本机缺的是：

- Visual Studio Build Tools 2022
- 并且安装时必须包含 `Desktop development with C++`

推荐安装命令：

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

如果你用 Chocolatey：

```powershell
choco install -y visualstudio2022buildtools --package-parameters "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --passive --norestart"
```

装完以后必须：
1. 关闭当前 PowerShell
2. 重新打开新的 PowerShell
3. 回到项目目录
4. 执行：

```powershell
where link
npm run tauri:dev:win
```

只要 `where link` 没输出，也不代表一定没装。现在仓库会先尝试自动加载 Visual Studio Build Tools 环境。

如果 `doctor:win` 输出：

```text
Doctor: found Visual Studio linker outside PATH: ...
Doctor: tauri:dev:win will activate the Visual Studio build environment automatically.
```

这表示：
- 你的 Build Tools 已经装好了
- 只是当前 PowerShell 没把 `link.exe` 放进 `PATH`
- 仓库会在启动时自动处理，不需要你自己再手工配环境变量

注意：
- VS Code 不是 `link.exe`
- 装了 VS Code 不代表装了 Visual C++ Build Tools

## 9. 打包命令

```powershell
cd C:\你的路径\micode_monitor
npm install
npm run doctor:win
npm run tauri:build:win
```

产物目录通常在：

```powershell
src-tauri\target\release\bundle\
```

## 10. 标准排查顺序

同事跑不起来时，不要只说“启动失败了”，按这个顺序回传：

### 第一步：确认目录

```powershell
Get-Location
```

### 第二步：确认环境

```powershell
npm run doctor:win
```

### 第三步：确认 `link.exe`

```powershell
where link
```

### 第四步：启动

```powershell
npm run tauri:dev:win
```

## 11. 发给同事的最短版

```powershell
cd C:\你的路径\micode_monitor
npm install
npm run doctor:win
npm run tauri:dev:win
```

如果还不行，让同事把这四段完整输出发回来：

```powershell
Get-Location
npm run doctor:win
where link
npm run tauri:dev:win
```
