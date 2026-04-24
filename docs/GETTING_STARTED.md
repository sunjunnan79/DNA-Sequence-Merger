# 快速开始

这份文档用于帮助你在本机快速确认：

1. 当前项目能不能正常启动
2. 构建失败到底是环境问题还是代码问题

## 1. 准备环境

需要：

- Node.js 18+
- npm 9+

检查版本：

```powershell
node -v
npm -v
```

如果命令不存在，但本机装过 Node.js，可以改用：

```powershell
& 'C:\Program Files\nodejs\node.exe' -v
& 'C:\Program Files\nodejs\npm.cmd' -v
```

## 2. 安装依赖

```powershell
npm install
```

## 3. 启动开发环境

```powershell
npm run electron:dev
```

这个命令会同时启动：

- Vite 前端开发服务器
- Electron 主进程

注意：

- 这个项目的开发模式已经通过 `vite-plugin-electron` 自动启动 Electron。
- 不要再额外手动执行 `electron .`，否则会看到两个窗口。
- 如果只想单独开前端页面，使用：

```powershell
npm run dev:web
```

## 4. 分步构建

建议不要一开始就执行完整打包，而是先分两步：

```powershell
npm run build:renderer
npm run build:electron
```

这样更容易判断问题发生在哪一层。

如果这两步都成功，再执行：

```powershell
npm run build
```

如果 `npm run build` 的最后一步失败，请继续检查 `release/win-unpacked/` 是否已经生成。
在当前项目里，只要这个目录存在，通常就说明应用主体已经构建完成，只是安装包封装阶段被外部依赖卡住。

## 5. 推荐排查顺序

如果构建失败，建议按下面顺序排查：

1. `node -v` / `npm -v` 是否正常
2. `npm install` 是否成功
3. `npm run build:renderer` 是否成功
4. `npm run build:electron` 是否成功
5. 最后才看 `npm run build`

## 6. 常见问题

### 找不到 npm

先确认：

```powershell
Test-Path 'C:\Program Files\nodejs\npm.cmd'
```

如果返回 `True`，直接使用绝对路径运行即可。

### 构建时报 `Access is denied`

这通常说明当前运行环境限制了 `node.exe` 或 `npm.cmd` 的执行权限。优先在你自己的本机终端里执行同样的命令确认，不要先怀疑仓库代码。

### `better-sqlite3` 原生模块异常

可以尝试：

```powershell
npm rebuild better-sqlite3
```

### `electron-builder` 下载失败

如果错误里包含下面这些关键词：

- `nsis`
- `winCodeSign`
- `github.com/electron-userland/electron-builder-binaries`
- `github.com/electron/electron/releases`

那通常说明当前网络拿不到 electron-builder 需要的外部二进制工具。

这时请优先检查：

1. `release/win-unpacked/` 是否已经生成
2. `release/win-unpacked/DNA Sequence Merger.exe` 是否可以直接运行

如果可以运行，说明项目代码和主构建链路已经没问题，剩下只是安装包封装依赖外网下载。

## 7. 常用命令

```powershell
npm install
npm run electron:dev
npm run build:renderer
npm run build:electron
npm run build
npm test
npm run lint
```
