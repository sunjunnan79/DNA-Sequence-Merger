# DNA Sequence Merger Desktop

一个基于 Electron + React + TypeScript 的桌面应用，用于按规则拼接 DNA 测序片段、翻译蛋白序列，并生成带 BLAST 比对结果的 Word 文档。

## 当前状态

- `build:renderer` 已验证可成功执行。
- `build:electron` 已验证可成功执行。
- `npm run build` 在当前环境下可以成功产出 `release/win-unpacked/` 目录。
- `npm run build` 的最后一步 NSIS 安装包生成仍依赖从 GitHub 下载 `nsis` 工具；如果当前网络无法访问 GitHub，这一步会失败，但不影响 `win-unpacked` 目录中的可执行版本使用。

## 技术栈

- Electron 28
- React 18
- TypeScript 5
- Vite 5
- better-sqlite3
- docx

## 目录结构

```text
full_DNA/
├─ src/
│  ├─ main/        # Electron 主进程
│  ├─ preload/     # preload 注入层
│  ├─ renderer/    # React 渲染进程
│  └─ shared/      # 共享类型
├─ DNA/            # 旧版 Python 项目
├─ docs/           # 文档
├─ dist/           # 前端构建产物
├─ dist-electron/  # Electron 构建产物
└─ release/        # 打包产物
```

## 环境要求

- Node.js 18 及以上
- npm 9 及以上

确认版本：

```powershell
node -v
npm -v
```

## 安装依赖

```powershell
npm install
```

## 开发启动

```powershell
npm run electron:dev
```

说明：

- 当前项目已经使用 `vite-plugin-electron` 在开发模式下自动拉起 Electron。
- 因此不要再同时手动执行 `electron .`，否则会出现两个窗口。
- 如果你只想单独启动前端调试页面，可以使用：

```powershell
npm run dev:web
```

## 构建

推荐按下面顺序执行：

```powershell
npm run build:renderer
npm run build:electron
```

确认都成功后，再执行完整打包：

```powershell
npm run build
```

如果本机终端找不到 `npm`，可以这样执行：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run build:renderer
& 'C:\Program Files\nodejs\npm.cmd' run build:electron
& 'C:\Program Files\nodejs\npm.cmd' run build
```

如果当前网络无法访问 GitHub，`electron-builder` 可能在最后的 NSIS 安装包步骤失败，但通常仍会生成：

```text
release/win-unpacked/DNA Sequence Merger.exe
```

这个目录版应用已经可以直接运行。

## 测试与检查

```powershell
npm test
npm run lint
```

## 常见问题

### 找不到 `npm`

先检查这些路径是否存在：

- `C:\Program Files\nodejs\node.exe`
- `C:\Program Files\nodejs\npm.cmd`

如果存在但 PATH 没配好，直接用绝对路径执行即可。

### 提示 `Access is denied`

这通常是终端权限或运行环境限制，不一定是项目代码错误。建议直接在本机 PowerShell 或 Windows Terminal 中执行构建命令确认。

### `better-sqlite3` 原生模块报错

可以尝试：

```powershell
npm rebuild better-sqlite3
```

### 安装包打包失败，但 `win-unpacked` 已生成

这通常是 `electron-builder` 在下载 NSIS 或其他外部打包工具时被网络拦住。若你只是想先运行应用，可直接使用：

```text
release/win-unpacked/DNA Sequence Merger.exe
```

## 相关文档

- [快速开始](C:\Users\21017\Desktop\full_DNA\docs\GETTING_STARTED.md)
- [部署说明](C:\Users\21017\Desktop\full_DNA\docs\DEPLOYMENT.md)
- [日志说明](C:\Users\21017\Desktop\full_DNA\docs\LOGGING.md)
