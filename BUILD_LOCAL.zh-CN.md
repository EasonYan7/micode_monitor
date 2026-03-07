# 本地运行与构建指南（Windows 优先）

当前项目面向内部同事以源码方式运行和测试。

这份文档解决 3 个最常见问题：
- 应该在哪个目录运行命令
- Windows 上正确的开发启动命令是什么
- `npm run tauri dev` 为什么很多同事会跑不起来

## 1. 先确认运行目录

所有命令都必须在**仓库根目录**运行，不要在 `src-tauri/` 目录里跑，也不要在仓库上一级目录里跑。

当前这台机器的正确目录是：

```powershell
C:\Users\mi\Desktop\micode_monitor\micode_monitor
```

进入目录的标准命令：

```powershell
cd C:\Users\mi\Desktop\micode_monitor\micode_monitor
```

如果你不确定自己是不是在正确目录，可以先执行：

```powershell
Get-Location
```

看到输出是仓库根目录，再继续下一步。

## 2. 当前这台机器的环境检查结果

我刚刚在这台机器上实际检查到：

- `node`: `v22.16.0`
- `npm`: `10.9.2`
- `rustc`: `1.93.0`
- `cargo`: `1.93.0`
- `cmake`: `4.2.3`
- `git`: `2.44.0.windows.1`
- `micode`: `1.1.15`

并且：

```powershell
npm run doctor:win
```

结果是：

```text
Doctor: OK
```

这说明**你这台机器本身的基础环境是满足的**。如果同事跑不起来，更大概率是：

- 没在仓库根目录运行
- 没先执行 `npm install`
- 用错了启动命令
- 新装完依赖后没有重开终端

## 3. Windows 上的标准启动步骤

### 方案 A：给同事的标准做法

第一次拉代码后，按这个顺序执行：

```powershell
cd C:\你的路径\micode_monitor
npm install
npm run doctor:win
npm run tauri:dev:win
```

### 方案 B：一键引导安装

如果同事缺依赖，推荐直接执行：

```powershell
cd C:\你的路径\micode_monitor
npm run bootstrap:win
```

执行完成后，再运行：

```powershell
npm run tauri:dev:win
```

## 4. 为什么不推荐直接写 `npm run tauri dev`

很多同事会直接输入：

```powershell
npm run tauri dev
```

这个写法不够稳定，也不够直观，容易让人误以为是标准命令。

在这个仓库里，**Windows 的标准命令**应该是下面两种之一：

```powershell
npm run tauri:dev:win
```

或者：

```powershell
npm run tauri -- dev
```

说明：

- `npm run tauri:dev:win`
  - 最直接，最不容易误用
  - 会先跑 Windows doctor，再启动 Tauri
- `npm run tauri -- dev`
  - 走仓库里的 `scripts/tauri-cli.mjs`
  - 它会自动在 Windows 转发到 `tauri:dev:win`

所以给同事发教程时，优先统一成：

```powershell
npm run tauri:dev:win
```

这样最清楚。

## 5. 如果要打包

Windows 本地打包命令：

```powershell
cd C:\你的路径\micode_monitor
npm install
npm run doctor:win
npm run tauri:build:win
```

产物目录：

```powershell
src-tauri\target\release\bundle\
```

## 6. 同事跑不起来时的标准排查顺序

让同事按下面顺序回报，不要一句“跑不起来”就结束：

### 第一步：确认目录

```powershell
Get-Location
```

必须是仓库根目录。

### 第二步：确认依赖

```powershell
npm run doctor:win
```

如果不是 `Doctor: OK`，先修依赖，不要直接继续。

### 第三步：安装前端依赖

```powershell
npm install
```

### 第四步：用标准命令启动

```powershell
npm run tauri:dev:win
```

### 第五步：如果仍失败，把完整输出发回来

至少需要这三段信息：

```powershell
Get-Location
npm run doctor:win
npm run tauri:dev:win
```

不要只发最后一句报错，因为很多问题是前面几行已经说明原因了。

## 7. 常见问题

### 问题 1：`npm run tauri dev` 没反应 / 不对

改用：

```powershell
npm run tauri:dev:win
```

原因是这个仓库给 Windows 单独配了启动脚本，直接用平台脚本最稳。

### 问题 2：`Doctor: missing dependencies ...`

先执行：

```powershell
npm run doctor:win:install
```

或者：

```powershell
npm run bootstrap:win
```

然后**重开 PowerShell**，再重新执行 doctor。

### 问题 3：新装完 Rust / Node / MiCode 还是提示找不到

这是因为当前终端还没刷新 PATH。

处理方法：

1. 关闭当前 PowerShell
2. 重新打开
3. 回到仓库根目录
4. 重新执行：

```powershell
npm run doctor:win
```

### 问题 4：在 `src-tauri` 目录里运行失败

这是错误目录。

请回到仓库根目录运行，不要在：

```powershell
src-tauri\
```

里直接执行 `npm` 命令。

## 8. 给同事的一段最短版说明

可以直接复制下面这段给同事：

```powershell
cd C:\你的路径\micode_monitor
npm install
npm run doctor:win
npm run tauri:dev:win
```

如果不行，再把下面三段完整输出发回来：

```powershell
Get-Location
npm run doctor:win
npm run tauri:dev:win
```
