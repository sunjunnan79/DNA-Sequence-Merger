import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import fs from 'fs';
import { Logger } from './utils/logger';
import { DatabaseService } from './services/database.service';
import { FileService } from './services/file.service';
import { SequenceProcessor } from './services/sequence.processor';
import { BlastService } from './services/blast.service';
import { DocumentGenerator } from './services/document.generator';
import { AutoUpdaterService } from './services/auto-updater.service';
import { IPCHandler } from './handlers/ipc.handler';

// 配置日志系统
Logger.configure();
Logger.info('Application starting...');

let mainWindow: BrowserWindow | null = null;

// 服务实例
let dbService: DatabaseService;
let fileService: FileService;
let sequenceProcessor: SequenceProcessor;
let blastService: BlastService;
let documentGenerator: DocumentGenerator;
let autoUpdaterService: AutoUpdaterService;
let ipcHandler: IPCHandler;

interface WindowConfig {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  webPreferences: {
    preload: string;
    contextIsolation: boolean;
    nodeIntegration: boolean;
  };
}

function resolvePreloadPath(): string {
  const candidates = [
    join(app.getAppPath(), 'dist-electron', 'preload.js'),
    join(process.resourcesPath, 'app.asar', 'dist-electron', 'preload.js'),
    join(process.resourcesPath, 'dist-electron', 'preload.js'),
    join(process.cwd(), 'dist-electron', 'preload.js'),
  ];

  const matched = candidates.find((candidate) => fs.existsSync(candidate));
  return matched || candidates[0];
}

function resolveRendererHtmlPath(): string {
  const candidates = [
    join(app.getAppPath(), 'dist', 'index.html'),
    join(process.resourcesPath, 'app.asar', 'dist', 'index.html'),
    join(process.resourcesPath, 'dist', 'index.html'),
    join(process.cwd(), 'dist', 'index.html'),
  ];

  const matched = candidates.find((candidate) => fs.existsSync(candidate));
  return matched || candidates[0];
}

function createWindow(): BrowserWindow {
  // 在开发环境和生产环境中正确获取 preload 脚本路径
  const preloadPath = resolvePreloadPath();
  
  Logger.info(`Preload script path: ${preloadPath}`);

  const config: WindowConfig = {
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  mainWindow = new BrowserWindow(config);

  // 开发环境加载Vite开发服务器
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    // 生产环境加载构建后的文件
    const rendererHtmlPath = resolveRendererHtmlPath();
    Logger.info(`Renderer HTML path: ${rendererHtmlPath}`);
    mainWindow.loadFile(rendererHtmlPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  Logger.info('Main window created');
  return mainWindow;
}

async function initializeServices(): Promise<void> {
  try {
    // 初始化数据库服务
    dbService = new DatabaseService();
    Logger.info('Database service initialized');

    // 初始化文件服务
    fileService = new FileService();
    Logger.info('File service initialized');

    // 初始化序列处理器
    sequenceProcessor = new SequenceProcessor(fileService);
    Logger.info('Sequence processor initialized');

    // 初始化BLAST服务
    blastService = new BlastService();
    Logger.info('BLAST service initialized');

    // 初始化文档生成器
    documentGenerator = new DocumentGenerator();
    Logger.info('Document generator initialized');

    // 初始化自动更新服务
    autoUpdaterService = new AutoUpdaterService();
    Logger.info('Auto-updater service initialized');

    // 初始化IPC处理器并注册处理函数
    ipcHandler = new IPCHandler(
      dbService,
      fileService,
      sequenceProcessor,
      blastService,
      documentGenerator,
      autoUpdaterService
    );
    ipcHandler.registerHandlers();
    Logger.info('IPC handlers registered');

    Logger.info('All services initialized successfully');
  } catch (error) {
    Logger.error('Failed to initialize services:', error);
    throw error;
  }
}

// 应用准备就绪
app.whenReady().then(async () => {
  await initializeServices();
  createWindow();

  // 设置自动更新服务的主窗口引用
  if (mainWindow && autoUpdaterService) {
    autoUpdaterService.setMainWindow(mainWindow);
    
    // 在生产环境中启动定期更新检查（每24小时检查一次）
    if (!process.env.VITE_DEV_SERVER_URL) {
      autoUpdaterService.startPeriodicUpdateCheck(24);
    }
  }

  app.on('activate', () => {
    // macOS上点击dock图标时重新创建窗口
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 所有窗口关闭时退出应用（macOS除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // 清理资源
    if (dbService) {
      dbService.close();
      Logger.info('Database connection closed');
    }
    app.quit();
  }
});

// 应用退出前清理
app.on('before-quit', () => {
  // 停止定期更新检查
  if (autoUpdaterService) {
    autoUpdaterService.stopPeriodicUpdateCheck();
  }
  
  if (dbService) {
    dbService.close();
    Logger.info('Database connection closed on quit');
  }

  // 清理旧日志文件（保留最近7天）
  Logger.clearOldLogs(7);
});

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  Logger.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  Logger.error('Unhandled rejection:', reason);
});
