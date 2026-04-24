# 日志系统文档

## 概述

应用使用 `electron-log` 库进行日志记录，提供统一的日志接口和配置。

## 日志文件位置

日志文件根据操作系统存储在不同位置：

- **Windows**: `%USERPROFILE%\AppData\Roaming\DNA Sequence Merger\logs\main.log`
- **macOS**: `~/Library/Logs/DNA Sequence Merger/main.log`
- **Linux**: `~/.config/DNA Sequence Merger/logs/main.log`

## 日志级别

应用支持以下日志级别（从低到高）：

1. **verbose**: 详细信息，用于深度调试
2. **debug**: 调试信息，开发环境使用
3. **info**: 一般信息，记录正常操作
4. **warn**: 警告信息，可能的问题
5. **error**: 错误信息，需要关注的问题

## 配置

### 文件日志
- 级别: `info` 及以上
- 格式: `[YYYY-MM-DD HH:mm:ss.ms] [LEVEL] message`
- 最大文件大小: 10MB
- 自动清理: 保留最近7天的日志

### 控制台日志
- 开发环境: `debug` 及以上
- 生产环境: `info` 及以上
- 格式: `[HH:mm:ss.ms] [LEVEL] message`

## 使用方法

### 在主进程中使用

```typescript
import { Logger } from './utils/logger';

// 记录信息
Logger.info('Operation completed successfully');

// 记录警告
Logger.warn('Configuration file not found, using defaults');

// 记录错误
Logger.error('Failed to connect to database', error);

// 记录调试信息
Logger.debug('Processing file:', filename);

// 性能监控
const startTime = Logger.startOperation('File processing');
// ... 执行操作 ...
Logger.endOperation('File processing', startTime);
```

### 在服务中使用

所有服务都应该使用 Logger 记录关键操作：

```typescript
import { Logger } from '../utils/logger';

class MyService {
  async processData(data: any): Promise<void> {
    Logger.info('Starting data processing');
    
    try {
      // 处理数据
      Logger.debug('Processing item:', data.id);
      
      // 成功
      Logger.info('Data processing completed');
    } catch (error) {
      Logger.error('Data processing failed:', error);
      throw error;
    }
  }
}
```

## 日志记录最佳实践

### 应该记录的内容

1. **应用生命周期事件**
   - 应用启动/关闭
   - 服务初始化
   - 窗口创建/销毁

2. **用户操作**
   - 文件导入
   - 规则保存/删除
   - 序列处理开始/完成

3. **错误和异常**
   - 文件读取失败
   - 网络请求失败
   - 数据库操作失败

4. **性能指标**
   - 长时间操作的耗时
   - 批量处理的进度

5. **系统信息**
   - 应用版本
   - 操作系统信息
   - 配置参数

### 不应该记录的内容

1. **敏感信息**
   - 用户密码
   - API密钥
   - 个人身份信息

2. **大量数据**
   - 完整的序列数据（可以记录长度和摘要）
   - 大型文件内容

3. **高频操作**
   - 鼠标移动
   - 滚动事件
   - 实时更新（除非是调试模式）

## 日志格式示例

```
[2024-01-15 10:30:45.123] [info] Application starting...
[2024-01-15 10:30:45.234] [info] Logger configured
[2024-01-15 10:30:45.345] [info] Log file location: C:\Users\...\logs\main.log
[2024-01-15 10:30:45.456] [info] App version: 1.0.0
[2024-01-15 10:30:45.567] [info] Database service initialized
[2024-01-15 10:30:45.678] [info] File service initialized
[2024-01-15 10:30:46.789] [info] All services initialized successfully
[2024-01-15 10:30:46.890] [info] Main window created
[2024-01-15 10:31:00.123] [info] Starting operation: File scanning
[2024-01-15 10:31:01.234] [info] Performance: File scanning took 1111ms
[2024-01-15 10:32:00.456] [warn] Missing file pattern: HpaB554 in group (样本1)
[2024-01-15 10:33:00.789] [error] Failed to connect to BLAST API: Network timeout
```

## 故障排查

### 查看日志文件

1. 在应用中添加"打开日志文件夹"功能
2. 或手动导航到日志文件位置
3. 使用文本编辑器打开 `main.log`

### 常见问题

**问题**: 日志文件过大
- **解决**: 应用会自动限制单个日志文件大小为10MB，并清理7天前的旧日志

**问题**: 找不到日志文件
- **解决**: 检查应用是否有写入权限，查看控制台输出的日志路径

**问题**: 日志信息不完整
- **解决**: 检查日志级别配置，确保设置为 `info` 或更低级别

## 调试模式

在开发环境中，可以启用更详细的日志：

```typescript
// 临时提高日志级别
Logger.configure();
log.transports.file.level = 'debug';
log.transports.console.level = 'debug';
```

## 日志分析

可以使用以下工具分析日志：

1. **grep/findstr**: 搜索特定关键词
   ```bash
   # Linux/macOS
   grep "error" main.log
   
   # Windows
   findstr "error" main.log
   ```

2. **日志查看器**: 使用专门的日志查看工具（如 Notepad++, Sublime Text）

3. **自定义脚本**: 编写脚本统计错误频率、性能指标等

## 未来改进

- [ ] 添加日志轮转（按日期分割日志文件）
- [ ] 实现远程日志上传（用于错误报告）
- [ ] 添加日志搜索和过滤UI
- [ ] 集成性能监控和分析工具
