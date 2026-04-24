# 启动问题修复总结

## 修复的问题

### 1. `__dirname` 未定义错误
**问题**: 在 ES 模块中 `__dirname` 不可用
**解决方案**: 使用 `process.cwd()` 来获取当前工作目录

### 2. `require` 未定义错误  
**问题**: Logger 中使用了 `require('fs')`，在 ES 模块中不可用
**解决方案**: 改用 ES6 的 `import fs from 'fs'`

### 3. `window.electronAPI` 未定义错误
**问题**: Preload 脚本被编译成 ES 模块格式，但 Electron 的 preload 需要 CommonJS 格式
**解决方案**: 修改 vite.config.ts，为 preload 脚本指定 CommonJS 输出格式

## 修改的文件

### 1. `src/main/main.ts`
- 修改 preload 脚本路径获取方式
- 添加日志输出 preload 路径

### 2. `src/main/utils/logger.ts`
- 添加 `import fs from 'fs'`
- 移除 `const fs = require('fs')`

### 3. `src/preload/preload.ts`
- 添加调试日志

### 4. `vite.config.ts`
- 为 preload 配置添加 `lib` 选项
- 指定输出格式为 `cjs` (CommonJS)

## 最终配置

### vite.config.ts - Preload 配置
```typescript
{
  entry: 'src/preload/preload.ts',
  onstart(options) {
    options.reload();
  },
  vite: {
    build: {
      outDir: 'dist-electron',
      lib: {
        entry: 'src/preload/preload.ts',
        formats: ['cjs'],
        fileName: () => 'preload.js'
      },
      rollupOptions: {
        external: ['electron']
      }
    }
  }
}
```

## 验证

编译后的 `dist-electron/preload.js` 应该以以下内容开头：

```javascript
"use strict";
const electron = require("electron");
```

而不是：

```javascript
import { contextBridge, ipcRenderer } from "electron";
```

## 启动命令

```bash
npm run electron:dev
```

## 预期结果

- ✅ 应用窗口正常打开
- ✅ 所有服务初始化成功
- ✅ `window.electronAPI` 可用
- ✅ 所有 IPC 调用正常工作
- ✅ 文件导入、规则管理等功能正常

## 常见问题

### Q: 为什么 preload 需要 CommonJS 格式？
A: Electron 的 preload 脚本在一个特殊的上下文中运行，需要使用 CommonJS 格式才能正确加载。

### Q: 为什么主进程可以使用 ES 模块？
A: 因为 package.json 中设置了 `"type": "module"`，Node.js 会将 .js 文件视为 ES 模块。但 preload 脚本有特殊要求。

### Q: 如何验证 preload 是否正确加载？
A: 打开开发者工具控制台，应该能看到：
```
[Preload] Script loaded
[Preload] Exposing electronAPI to main world
[Preload] electronAPI exposed successfully
```

并且 `window.electronAPI` 应该是一个包含所有 API 方法的对象。
