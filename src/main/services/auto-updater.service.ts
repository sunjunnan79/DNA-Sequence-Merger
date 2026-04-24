import { app, BrowserWindow, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import fs from 'fs';
import log from 'electron-log';
import path from 'path';

/**
 * 自动更新服务。
 *
 * 虽然当前用户的核心诉求是“先把文档生成功能跑通”，但这个服务会在应用启动阶段被实例化，
 * 一旦这里存在语法错误，整个主进程都会直接启动失败，因此需要保证它至少处于稳定可运行状态。
 */
export class AutoUpdaterService {
  private mainWindow: BrowserWindow | null = null;
  private updateCheckInterval: NodeJS.Timeout | null = null;
  private updaterEnabled = false;
  private updaterDisabledReason = '';

  constructor() {
    this.configureAutoUpdater();
  }

  /**
   * 初始化自动更新器配置。
   */
  private configureAutoUpdater(): void {
    autoUpdater.logger = log;
    (autoUpdater.logger as typeof log).transports.file.level = 'info';

    // 当前策略是“发现更新后提示用户，由用户决定是否下载”，避免在不知情的情况下占用网络。
    autoUpdater.autoDownload = false;

    // 如果更新已经下载完成，则允许在应用退出时自动安装。
    autoUpdater.autoInstallOnAppQuit = true;

    const availability = this.resolveUpdaterAvailability();
    this.updaterEnabled = availability.enabled;
    this.updaterDisabledReason = availability.reason;

    if (!this.updaterEnabled) {
      log.info(`Auto-updater disabled: ${this.updaterDisabledReason}`);
      return;
    }

    this.registerEventListeners();
    log.info('Auto-updater configured');
  }

  /**
   * 注册更新事件监听。
   */
  private registerEventListeners(): void {
    autoUpdater.on('checking-for-update', () => {
      log.info('Checking for updates...');
      this.sendStatusToWindow('正在检查更新...');
    });

    autoUpdater.on('update-available', (info) => {
      log.info('Update available:', info);
      this.sendStatusToWindow(`发现新版本：${info.version}`);

      if (!this.mainWindow) {
        return;
      }

      void dialog
        .showMessageBox(this.mainWindow, {
          type: 'info',
          title: '发现新版本',
          message: `发现新版本 ${info.version}，是否立即下载？`,
          buttons: ['立即下载', '稍后再说'],
          defaultId: 0,
          cancelId: 1,
        })
        .then((result) => {
          if (result.response === 0) {
            this.sendStatusToWindow('开始下载更新...');
            void autoUpdater.downloadUpdate();
          }
        });
    });

    autoUpdater.on('update-not-available', (info) => {
      log.info('Update not available:', info);
      this.sendStatusToWindow('当前已经是最新版本。');
    });

    autoUpdater.on('download-progress', (progressObj) => {
      const message = `更新下载进度：${progressObj.percent.toFixed(2)}%`;
      log.info(message);
      this.sendStatusToWindow(message);
    });

    autoUpdater.on('update-downloaded', (info) => {
      log.info('Update downloaded:', info);
      this.sendStatusToWindow('更新下载完成。');

      if (!this.mainWindow) {
        return;
      }

      void dialog
        .showMessageBox(this.mainWindow, {
          type: 'info',
          title: '更新已下载',
          message: '新版本已经下载完成，是否立即重启应用并安装？',
          buttons: ['立即重启', '稍后重启'],
          defaultId: 0,
          cancelId: 1,
        })
        .then((result) => {
          if (result.response === 0) {
            setImmediate(() => autoUpdater.quitAndInstall());
          }
        });
    });

    autoUpdater.on('error', (error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error('Update error:', error);
      this.sendStatusToWindow(`检查更新失败：${errorMessage}`);

      if (!this.mainWindow) {
        return;
      }

      void dialog.showMessageBox(this.mainWindow, {
        type: 'error',
        title: '更新失败',
        message: `检查或下载更新时发生错误：\n${errorMessage}`,
        buttons: ['知道了'],
      });
    });
  }

  /**
   * 注入主窗口实例，便于弹窗提示和向渲染进程发送状态。
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * 当前更新能力是否可用。
   */
  isEnabled(): boolean {
    return this.updaterEnabled;
  }

  /**
   * 获取当前不可用原因。
   */
  getDisabledReason(): string {
    return this.updaterDisabledReason;
  }

  /**
   * 把状态同步给渲染进程。
   */
  private sendStatusToWindow(message: string): void {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('update-status', message);
    }
  }

  /**
   * 手动检查更新。
   */
  async checkForUpdates(silentIfUnavailable: boolean = false): Promise<void> {
    if (!this.updaterEnabled) {
      await this.handleUpdaterUnavailable(silentIfUnavailable);
      return;
    }

    try {
      log.info('Manual update check initiated');
      await autoUpdater.checkForUpdates();
    } catch (error) {
      log.error('Failed to check for updates:', error);
      throw error;
    }
  }

  /**
   * 启动定时检查更新。
   */
  startPeriodicUpdateCheck(intervalHours: number = 24): void {
    if (!this.updaterEnabled) {
      log.info(`Skipping periodic update check: ${this.updaterDisabledReason}`);
      return;
    }

    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
    }

    void this.checkForUpdates(true).catch((error) => {
      log.error('Initial update check failed:', error);
    });

    const intervalMs = intervalHours * 60 * 60 * 1000;
    this.updateCheckInterval = setInterval(() => {
      void this.checkForUpdates(true).catch((error) => {
        log.error('Periodic update check failed:', error);
      });
    }, intervalMs);

    log.info(`Periodic update check started (every ${intervalHours} hours)`);
  }

  /**
   * 停止定时检查更新。
   */
  stopPeriodicUpdateCheck(): void {
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
      this.updateCheckInterval = null;
      log.info('Periodic update check stopped');
    }
  }

  /**
   * 下载更新包。
   */
  async downloadUpdate(silentIfUnavailable: boolean = false): Promise<void> {
    if (!this.updaterEnabled) {
      await this.handleUpdaterUnavailable(silentIfUnavailable);
      return;
    }

    try {
      log.info('Starting update download');
      await autoUpdater.downloadUpdate();
    } catch (error) {
      log.error('Failed to download update:', error);
      throw error;
    }
  }

  /**
   * 退出并安装更新。
   */
  quitAndInstall(): void {
    if (!this.updaterEnabled) {
      log.info(`Skip quitAndInstall because updater is disabled: ${this.updaterDisabledReason}`);
      return;
    }

    log.info('Quitting and installing update');
    autoUpdater.quitAndInstall(false, true);
  }

  /**
   * 获取当前版本号。
   */
  getCurrentVersion(): string {
    return app.getVersion();
  }

  private async handleUpdaterUnavailable(silent: boolean): Promise<void> {
    const message = this.updaterDisabledReason || '自动更新当前不可用。';
    log.info(`Auto-updater unavailable: ${message}`);
    this.sendStatusToWindow(message);

    if (silent || !this.mainWindow) {
      return;
    }

    await dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: '自动更新不可用',
      message,
      buttons: ['知道了'],
    });
  }

  private resolveUpdaterAvailability(): { enabled: boolean; reason: string } {
    if (!app.isPackaged) {
      return { enabled: false, reason: '开发环境不启用自动更新。' };
    }

    if (this.isPortableBuild()) {
      return { enabled: false, reason: '便携版 exe 不支持自动更新，请下载新的安装包或便携版覆盖。' };
    }

    const updateConfigPath = path.join(process.resourcesPath, 'app-update.yml');
    if (!fs.existsSync(updateConfigPath)) {
      return { enabled: false, reason: '未找到更新配置文件，已跳过自动更新。' };
    }

    try {
      const content = fs.readFileSync(updateConfigPath, 'utf-8');
      const provider = this.extractYamlValue(content, 'provider');
      const url = this.extractYamlValue(content, 'url');

      if (!provider) {
        return { enabled: false, reason: '更新配置缺少 provider，已跳过自动更新。' };
      }

      if (provider === 'generic') {
        if (!url) {
          return { enabled: false, reason: '未配置更新服务器地址，已跳过自动更新。' };
        }

        if (
          url.includes('your-update-server.com') ||
          url.includes('example.com') ||
          url.includes('${')
        ) {
          return { enabled: false, reason: '当前构建未配置有效的更新服务器地址，已跳过自动更新。' };
        }
      }

      return { enabled: true, reason: '' };
    } catch (error) {
      return {
        enabled: false,
        reason: `读取更新配置失败，已跳过自动更新: ${(error as Error).message}`,
      };
    }
  }

  private extractYamlValue(content: string, key: string): string {
    const match = content.match(new RegExp(`^\\s*${key}:\\s*(.+?)\\s*$`, 'm'));
    return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : '';
  }

  private isPortableBuild(): boolean {
    return Boolean(process.env.PORTABLE_EXECUTABLE_FILE || process.env.PORTABLE_EXECUTABLE_DIR);
  }
}
