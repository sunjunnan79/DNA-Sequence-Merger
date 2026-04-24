# 部署指南

## 概述

本文档介绍如何构建和部署 DNA Sequence Merger 桌面应用到不同平台。

## 前置要求

### 开发环境

- Node.js 18+ 
- npm 或 yarn
- Git

### 平台特定要求

#### Windows
- Windows 10 或更高版本
- 无需额外工具（electron-builder 会自动处理）

#### macOS
- macOS 10.13 或更高版本
- Xcode Command Line Tools
- 可选：Apple Developer 账号（用于代码签名）

#### Linux
- Ubuntu 18.04+ 或其他主流发行版
- 标准构建工具（gcc, make 等）

## 构建步骤

### 1. 安装依赖

```bash
npm install
```

### 2. 准备应用图标

将应用图标文件放置在 `build/` 目录：

- `build/icon.ico` - Windows 图标
- `build/icon.icns` - macOS 图标
- `build/icon.png` - Linux 图标（512x512 或更大）

参考 `build/README.md` 了解如何创建图标文件。

### 3. 构建应用

#### 构建所有平台（需要在对应平台上运行）

```bash
npm run build
```

#### 仅构建 Windows 版本

```bash
npm run build:win
```

生成文件：
- `release/DNA Sequence Merger-1.0.0-x64.exe` - NSIS 安装程序（64位）
- `release/DNA Sequence Merger-1.0.0-ia32.exe` - NSIS 安装程序（32位）
- `release/DNA Sequence Merger-1.0.0-portable.exe` - 便携版（64位）

#### 仅构建 macOS 版本

```bash
npm run build:mac
```

生成文件：
- `release/DNA Sequence Merger-1.0.0-x64.dmg` - Intel Mac 安装包
- `release/DNA Sequence Merger-1.0.0-arm64.dmg` - Apple Silicon 安装包
- `release/DNA Sequence Merger-1.0.0-x64.zip` - Intel Mac 压缩包
- `release/DNA Sequence Merger-1.0.0-arm64.zip` - Apple Silicon 压缩包

#### 仅构建 Linux 版本

```bash
npm run build:linux
```

生成文件：
- `release/DNA Sequence Merger-1.0.0-x64.AppImage` - AppImage 格式
- `release/DNA Sequence Merger-1.0.0-x64.deb` - Debian 包

#### 构建所有平台（在单一平台上）

```bash
npm run build:all
```

注意：跨平台构建可能需要额外配置。

## 配置说明

### electron-builder 配置

配置文件位于 `electron-builder.json`，包含以下主要配置：

#### 通用配置

```json
{
  "appId": "com.dna.sequence.merger",
  "productName": "DNA Sequence Merger",
  "directories": {
    "output": "release",
    "buildResources": "build"
  }
}
```

#### Windows 配置

- **NSIS 安装程序**：支持自定义安装路径、桌面快捷方式
- **便携版**：无需安装，直接运行
- **架构**：支持 x64 和 ia32

#### macOS 配置

- **DMG**：拖拽安装方式
- **ZIP**：压缩包格式
- **架构**：支持 Intel (x64) 和 Apple Silicon (arm64)
- **代码签名**：需要配置 Apple Developer 证书

#### Linux 配置

- **AppImage**：通用格式，无需安装
- **DEB**：Debian/Ubuntu 包管理器格式
- **依赖**：自动包含必需的系统库

## 代码签名

### Windows 代码签名

1. 获取代码签名证书（.pfx 或 .p12 文件）
2. 设置环境变量：

```bash
set CSC_LINK=path/to/certificate.pfx
set CSC_KEY_PASSWORD=your_password
```

3. 运行构建命令

### macOS 代码签名

1. 加入 Apple Developer Program
2. 创建开发者证书
3. 设置环境变量：

```bash
export CSC_LINK=path/to/certificate.p12
export CSC_KEY_PASSWORD=your_password
export APPLE_ID=your@email.com
export APPLE_ID_PASSWORD=app_specific_password
```

4. 运行构建命令

### 跳过代码签名（开发测试）

```bash
export CSC_IDENTITY_AUTO_DISCOVERY=false
npm run build
```

## 自动更新配置

### 1. 设置更新服务器

应用使用 `electron-updater` 进行自动更新。需要配置更新服务器 URL：

在 `electron-builder.json` 中：

```json
{
  "publish": {
    "provider": "generic",
    "url": "https://your-update-server.com/releases"
  }
}
```

### 2. 更新服务器结构

更新服务器应该提供以下文件：

```
releases/
├── latest.yml (Windows)
├── latest-mac.yml (macOS)
├── latest-linux.yml (Linux)
├── DNA Sequence Merger-1.0.0-x64.exe
├── DNA Sequence Merger-1.0.0-x64.dmg
└── DNA Sequence Merger-1.0.0-x64.AppImage
```

### 3. 发布更新

1. 构建新版本
2. 上传构建产物到更新服务器
3. 更新 `latest*.yml` 文件
4. 应用会自动检测并提示用户更新

### 4. 使用 GitHub Releases

如果使用 GitHub 托管更新：

```json
{
  "publish": {
    "provider": "github",
    "owner": "your-username",
    "repo": "dna-sequence-merger"
  }
}
```

设置 GitHub Token：

```bash
export GH_TOKEN=your_github_token
```

## 发布流程

### 1. 版本更新

更新 `package.json` 中的版本号：

```json
{
  "version": "1.1.0"
}
```

### 2. 构建应用

```bash
npm run build:all
```

### 3. 测试构建产物

在目标平台上测试安装和运行。

### 4. 创建发布说明

创建 `CHANGELOG.md` 记录更新内容：

```markdown
## [1.1.0] - 2024-01-15

### 新增
- 添加批量处理功能
- 支持更多文件格式

### 修复
- 修复文件扫描bug
- 优化内存使用

### 改进
- 提升处理速度
- 改进用户界面
```

### 5. 上传到发布平台

#### GitHub Releases

```bash
# 使用 electron-builder 自动发布
npm run build:all -- --publish always
```

#### 手动上传

1. 创建 GitHub Release
2. 上传构建产物
3. 添加发布说明

## 故障排查

### 构建失败

**问题**: 依赖安装失败
```bash
# 清理并重新安装
rm -rf node_modules package-lock.json
npm install
```

**问题**: 原生模块编译失败
```bash
# 重新构建原生模块
npm run rebuild
```

### 应用无法启动

**问题**: 缺少依赖
- 检查 `package.json` 中的 `dependencies`
- 确保所有原生模块正确打包

**问题**: 权限问题
- Windows: 以管理员身份运行
- macOS/Linux: 检查文件权限

### 自动更新不工作

**问题**: 无法检查更新
- 检查更新服务器 URL 配置
- 确保网络连接正常
- 查看日志文件

**问题**: 下载失败
- 检查服务器文件权限
- 确保 `latest*.yml` 文件正确

## 性能优化

### 减小应用体积

1. **移除未使用的依赖**
```bash
npm prune --production
```

2. **使用 asar 打包**（默认启用）
```json
{
  "asar": true
}
```

3. **排除开发依赖**
```json
{
  "files": [
    "dist/**/*",
    "dist-electron/**/*",
    "!node_modules/**/*",
    "node_modules/better-sqlite3/**/*"
  ]
}
```

### 加快启动速度

1. 延迟加载非关键模块
2. 使用代码分割
3. 优化数据库查询

## 安全建议

1. **代码签名**: 始终对发布版本进行代码签名
2. **更新验证**: 使用 HTTPS 进行更新检查
3. **依赖审计**: 定期运行 `npm audit`
4. **最小权限**: 只请求必需的系统权限

## 持续集成

### GitHub Actions 示例

创建 `.github/workflows/build.yml`：

```yaml
name: Build

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [windows-latest, macos-latest, ubuntu-latest]
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - name: Install dependencies
        run: npm install
      
      - name: Build
        run: npm run build
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: ${{ matrix.os }}-build
          path: release/*
```

## 支持和反馈

如有问题或建议，请：

1. 查看日志文件（参考 `docs/LOGGING.md`）
2. 提交 Issue 到 GitHub
3. 联系开发团队

## 相关文档

- [日志系统文档](./LOGGING.md)
- [开发指南](../README.md)
- [electron-builder 文档](https://www.electron.build/)
