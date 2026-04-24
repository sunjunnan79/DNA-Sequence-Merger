import log from 'electron-log';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

/**
 * 日志工具类
 * 提供统一的日志配置和接口
 */
export class Logger {
  /**
   * 配置日志系统
   */
  static configure(): void {
    // 设置日志文件路径
    // Windows: %USERPROFILE%\AppData\Roaming\DNA Sequence Merger\logs
    // macOS: ~/Library/Logs/DNA Sequence Merger
    // Linux: ~/.config/DNA Sequence Merger/logs
    const logPath = path.join(app.getPath('userData'), 'logs');
    log.transports.file.resolvePathFn = () => path.join(logPath, 'main.log');

    // 配置文件日志级别
    log.transports.file.level = 'info';
    
    // 配置控制台日志级别（开发环境显示debug，生产环境显示info）
    log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info';

    // 配置日志格式
    log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
    log.transports.console.format = '[{h}:{i}:{s}.{ms}] [{level}] {text}';

    // 设置最大日志文件大小（10MB）
    log.transports.file.maxSize = 10 * 1024 * 1024;

    // 捕获控制台输出
    log.catchErrors({
      showDialog: false,
      onError: (error) => {
        log.error('Uncaught error:', error);
      }
    });

    log.info('Logger configured');
    log.info(`Log file location: ${log.transports.file.getFile().path}`);
    log.info(`App version: ${app.getVersion()}`);
    log.info(`Electron version: ${process.versions.electron}`);
    log.info(`Node version: ${process.versions.node}`);
    log.info(`Platform: ${process.platform}`);
  }

  /**
   * 记录信息日志
   */
  static info(message: string, ...args: any[]): void {
    log.info(message, ...args);
  }

  /**
   * 记录警告日志
   */
  static warn(message: string, ...args: any[]): void {
    log.warn(message, ...args);
  }

  /**
   * 记录错误日志
   */
  static error(message: string, error?: any): void {
    if (error) {
      log.error(message, error);
      // 如果是Error对象，记录堆栈信息
      if (error instanceof Error && error.stack) {
        log.error('Stack trace:', error.stack);
      }
    } else {
      log.error(message);
    }
  }

  /**
   * 记录调试日志
   */
  static debug(message: string, ...args: any[]): void {
    log.debug(message, ...args);
  }

  /**
   * 记录详细日志
   */
  static verbose(message: string, ...args: any[]): void {
    log.verbose(message, ...args);
  }

  /**
   * 获取日志文件路径
   */
  static getLogPath(): string {
    return log.transports.file.getFile().path;
  }

  /**
   * 清除旧日志文件
   * @param daysToKeep 保留最近几天的日志
   */
  static clearOldLogs(daysToKeep: number = 7): void {
    try {
      const logDir = path.dirname(log.transports.file.getFile().path);
      
      if (!fs.existsSync(logDir)) {
        return;
      }

      const files = fs.readdirSync(logDir);
      const now = Date.now();
      const maxAge = daysToKeep * 24 * 60 * 60 * 1000;

      files.forEach((file: string) => {
        const filePath = path.join(logDir, file);
        const stats = fs.statSync(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          fs.unlinkSync(filePath);
          log.info(`Deleted old log file: ${file}`);
        }
      });
    } catch (error) {
      log.error('Failed to clear old logs:', error);
    }
  }

  /**
   * 记录性能指标
   */
  static performance(operation: string, duration: number): void {
    log.info(`Performance: ${operation} took ${duration}ms`);
  }

  /**
   * 记录操作开始
   */
  static startOperation(operation: string): number {
    log.info(`Starting operation: ${operation}`);
    return Date.now();
  }

  /**
   * 记录操作结束
   */
  static endOperation(operation: string, startTime: number): void {
    const duration = Date.now() - startTime;
    this.performance(operation, duration);
  }
}

// 导出默认的log实例供直接使用
export default log;
