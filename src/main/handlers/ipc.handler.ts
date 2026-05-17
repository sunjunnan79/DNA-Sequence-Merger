import { ipcMain, dialog, shell } from 'electron';
import path from 'path';
import { DatabaseService } from '../services/database.service';
import { FileService } from '../services/file.service';
import { SequenceProcessor } from '../services/sequence.processor';
import { BlastService } from '../services/blast.service';
import { DocumentGenerator } from '../services/document.generator';
import { AutoUpdaterService } from '../services/auto-updater.service';
import { Logger } from '../utils/logger';
import { ConcurrencyLimiter } from '../utils/concurrency-limiter';
import type {
  MergeRule,
  FileGroup,
  ProcessOptions,
  ProcessResult,
  DocumentOptions,
  BlastAlignment,
  ProcessProgress,
} from '../../shared/types';

/**
 * 主进程 IPC 处理器。
 *
 * 这里集中管理渲染进程和主进程之间的桥接调用，避免业务逻辑散落在多个文件中。
 * 由于当前项目承担“从旧版 Python 工具迁移到 Electron 桌面端”的职责，因此这里会同时
 * 编排文件扫描、规则管理、序列处理、文档生成、日志目录打开等核心流程。
 */
export class IPCHandler {
  private dbService: DatabaseService;
  private fileService: FileService;
  private sequenceProcessor: SequenceProcessor;
  private blastService: BlastService;
  private documentGenerator: DocumentGenerator;
  private autoUpdaterService?: AutoUpdaterService;
  private activeProgressSender?: (progress: ProcessProgress) => void;

  constructor(
    dbService: DatabaseService,
    fileService: FileService,
    sequenceProcessor: SequenceProcessor,
    blastService: BlastService,
    documentGenerator: DocumentGenerator,
    autoUpdaterService?: AutoUpdaterService,
  ) {
    this.dbService = dbService;
    this.fileService = fileService;
    this.sequenceProcessor = sequenceProcessor;
    this.blastService = blastService;
    this.documentGenerator = documentGenerator;
    this.autoUpdaterService = autoUpdaterService;
  }

  /**
   * 注册全部 IPC 通道。
   *
   * 之所以集中在一个方法中统一注册，是为了让主进程初始化时更容易检查“哪些功能已经可用”。
   */
  registerHandlers(): void {
    ipcMain.handle('select-directory', this.handleSelectDirectory.bind(this));
    ipcMain.handle('select-archive', this.handleSelectArchive.bind(this));
    ipcMain.handle('scan-files', this.handleScanFiles.bind(this));
    ipcMain.handle('generate-output-path', this.handleGenerateOutputPath.bind(this));

    ipcMain.handle('get-rules', this.handleGetRules.bind(this));
    ipcMain.handle('save-rule', this.handleSaveRule.bind(this));
    ipcMain.handle('delete-rule', this.handleDeleteRule.bind(this));

    ipcMain.handle('get-config', this.handleGetConfig.bind(this));
    ipcMain.handle('save-config', this.handleSaveConfig.bind(this));

    ipcMain.handle('process-sequences', this.handleProcessSequences.bind(this));
    ipcMain.handle('validate-output-path', this.handleValidateOutputPath.bind(this));
    ipcMain.handle('generate-document', this.handleGenerateDocument.bind(this));

    ipcMain.handle('cleanup-temp', this.handleCleanupTemp.bind(this));

    if (this.autoUpdaterService) {
      ipcMain.handle('check-for-updates', this.handleCheckForUpdates.bind(this));
      ipcMain.handle('download-update', this.handleDownloadUpdate.bind(this));
      ipcMain.handle('quit-and-install', this.handleQuitAndInstall.bind(this));
      ipcMain.handle('get-app-version', this.handleGetAppVersion.bind(this));
    }

    ipcMain.handle('get-log-path', this.handleGetLogPath.bind(this));
    ipcMain.handle('open-log-folder', this.handleOpenLogFolder.bind(this));
  }

  /**
   * 选择原始序列文件所在目录。
   */
  private async handleSelectDirectory(): Promise<string> {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: '选择包含序列文件的文件夹',
      });

      if (result.canceled || result.filePaths.length === 0) {
        return '';
      }

      return result.filePaths[0];
    } catch (error) {
      throw new Error(`Failed to select directory: ${error}`);
    }
  }

  /**
   * 选择压缩包文件。
   *
   * 目前底层 `FileService.extractArchive` 只支持 zip，因此这里虽然保留 rar/7z 的展示，
   * 但实际扫描时仍会由底层给出清晰错误信息。
   */
  private async handleSelectArchive(): Promise<string> {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        title: '选择压缩包文件',
        filters: [
          { name: '压缩包', extensions: ['zip', 'rar', '7z'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return '';
      }

      return result.filePaths[0];
    } catch (error) {
      throw new Error(`Failed to select archive: ${error}`);
    }
  }

  /**
   * 扫描目录或压缩包中的序列文件，并按组返回。
   */
  private async handleScanFiles(_event: Electron.IpcMainInvokeEvent, targetPath: string): Promise<FileGroup[]> {
    try {
      let scanPath = targetPath;
      const ext = path.extname(targetPath).toLowerCase();

      if (ext === '.zip' || ext === '.rar' || ext === '.7z') {
        scanPath = await this.fileService.extractArchive(targetPath);
      }

      const files = await this.fileService.scanDirectory(scanPath);
      const groups = this.fileService.groupFiles(files);

      return groups;
    } catch (error) {
      throw new Error(`Failed to scan files: ${error}`);
    }
  }

  /**
   * 根据输入源路径生成默认输出文档路径。
   */
  private async handleGenerateOutputPath(
    _event: Electron.IpcMainInvokeEvent,
    inputPath: string,
  ): Promise<string> {
    try {
      const parsed = path.parse(inputPath);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const outputFileName = `${parsed.name}_结果_${timestamp}.docx`;
      return path.join(parsed.dir, outputFileName);
    } catch (error) {
      throw new Error(`Failed to generate output path: ${error}`);
    }
  }

  /**
   * 获取全部拼接规则。
   */
  private async handleGetRules(): Promise<MergeRule[]> {
    try {
      return this.dbService.getAllRules();
    } catch (error) {
      throw new Error(`Failed to get rules: ${error}`);
    }
  }

  /**
   * 新建或更新拼接规则。
   */
  private async handleSaveRule(_event: Electron.IpcMainInvokeEvent, rule: MergeRule): Promise<MergeRule> {
    try {
      if (rule.id) {
        return this.dbService.updateRule(rule.id, rule);
      }

      return this.dbService.createRule(rule);
    } catch (error) {
      throw new Error(`Failed to save rule: ${error}`);
    }
  }

  /**
   * 删除规则。
   */
  private async handleDeleteRule(_event: Electron.IpcMainInvokeEvent, id: number): Promise<void> {
    try {
      this.dbService.deleteRule(id);
    } catch (error) {
      throw new Error(`Failed to delete rule: ${error}`);
    }
  }

  /**
   * 获取配置项。
   */
  private async handleGetConfig(_event: Electron.IpcMainInvokeEvent, key: string): Promise<unknown> {
    try {
      return this.dbService.getConfig(key);
    } catch (error) {
      throw new Error(`Failed to get config: ${error}`);
    }
  }

  /**
   * 保存配置项。
   */
  private async handleSaveConfig(
    _event: Electron.IpcMainInvokeEvent,
    key: string,
    value: unknown,
  ): Promise<void> {
    try {
      this.dbService.saveConfig(key, value);
    } catch (error) {
      throw new Error(`Failed to save config: ${error}`);
    }
  }

  /**
   * 执行序列拼接和翻译。
   *
   * 这里按照“文件组”并发处理，避免单组失败影响全部任务，同时限制并发度，减少磁盘读写高峰。
   */
  private async handleProcessSequences(
    event: Electron.IpcMainInvokeEvent,
    options: ProcessOptions,
  ): Promise<ProcessResult[]> {
    const sendProgress = (progress: ProcessProgress) => {
      event.sender.send('process-progress', progress);
    };

    this.activeProgressSender = sendProgress;

    try {
      const fileGroups = this.fileService.groupFiles(options.files);
      const totalGroups = fileGroups.length;
      let completedGroups = 0;
      let successCount = 0;
      let failureCount = 0;
      let warningCount = 0;

      sendProgress({
        stage: 'preparing',
        progress: totalGroups > 0 ? 5 : 15,
        message: totalGroups > 0 ? `已准备 ${totalGroups} 个文件组，开始处理` : '未发现可处理的文件组',
        current: 0,
        total: totalGroups,
        successCount: 0,
        failureCount: 0,
        warningCount: 0,
        logLevel: 'info',
      });

      const limiter = new ConcurrencyLimiter(4);

      const tasks = fileGroups.map((group) => {
        return async () => {
          sendProgress({
            stage: 'processing-groups',
            progress: this.computeStageProgress(0, totalGroups, 12, 72),
            message: `正在解析 ${group.groupName}`,
            current: completedGroups,
            total: totalGroups,
            successCount,
            failureCount,
            warningCount,
            groupName: group.groupName,
            logLevel: 'info',
          });

          try {
            const result = await this.sequenceProcessor.mergeSequences({
              rule: options.rule,
              files: group.files,
            });

            completedGroups += 1;
            warningCount += result.warnings.length;
            const isSuccess = result.dnaSequence.length > 0;
            if (isSuccess) {
              successCount += 1;
              Logger.info(
                `[Process] Parsed group ${result.groupName} successfully (warnings=${result.warnings.length}, dnaLength=${result.dnaSequence.length}, proteinLength=${result.proteinSequence.length})`,
              );
            } else {
              failureCount += 1;
              Logger.warn(
                `[Process] Parsed group ${result.groupName} with empty DNA result (warnings=${result.warnings.length})`,
              );
            }

            sendProgress({
              stage: 'processing-groups',
              progress: this.computeStageProgress(completedGroups, totalGroups, 12, 72),
              message: isSuccess
                ? `已完成 ${result.groupName}`
                : `${result.groupName} 处理完成，但结果为空`,
              current: completedGroups,
              total: totalGroups,
              successCount,
              failureCount,
              warningCount,
              groupName: result.groupName,
              logLevel: isSuccess ? 'info' : 'warning',
            });

            return result;
          } catch (error) {
            completedGroups += 1;
            failureCount += 1;
            const message = (error as Error).message;
            Logger.error(`[Process] Failed to parse group ${group.groupName}: ${message}`);
            sendProgress({
              stage: 'processing-groups',
              progress: this.computeStageProgress(completedGroups, totalGroups, 12, 72),
              message: `${group.groupName} 处理失败: ${message}`,
              current: completedGroups,
              total: totalGroups,
              successCount,
              failureCount,
              warningCount,
              groupName: group.groupName,
              logLevel: 'error',
            });
            throw error;
          }
        };
      });

      const results = await limiter.runAll(tasks);

      sendProgress({
        stage: 'processing-complete',
        progress: totalGroups > 0 ? 72 : 75,
        message: `序列处理完成：成功 ${successCount}，异常 ${failureCount}，警告 ${warningCount}`,
        current: completedGroups,
        total: totalGroups,
        successCount,
        failureCount,
        warningCount,
        logLevel: failureCount > 0 ? 'warning' : 'info',
      });

      return results;
    } catch (error) {
      sendProgress({
        stage: 'error',
        progress: 100,
        message: `序列处理失败: ${(error as Error).message}`,
        logLevel: 'error',
      });
      this.activeProgressSender = undefined;
      throw new Error(`Failed to process sequences: ${error}`);
    }
  }

  /**
   * 在正式解析序列前检查输出路径是否可写。
   *
   * 这个 IPC 专门给“开始处理”按钮使用：用户点击后立即检查目标 docx 是否被 Word/WPS 占用，
   * 检查通过才进入耗时的解析、翻译和 BLAST 阶段。
   */
  private async handleValidateOutputPath(
    _event: Electron.IpcMainInvokeEvent,
    outputPath: string,
  ): Promise<void> {
    try {
      this.documentGenerator.validateOutputPath(outputPath);
    } catch (error) {
      throw new Error(`Failed to validate output path: ${(error as Error).message}`);
    }
  }

  /**
   * 生成目标 Word 文档。
   *
   * 这里额外做了一层 BLAST 结果转换，是因为渲染进程通过 IPC 传值时，
   * `Map` 有可能被还原成普通对象，也有可能本身就是 `Map`。如果不兼容处理，
   * 会出现文档生成阶段查不到对齐结果的问题。
   */
  private async handleGenerateDocument(
    event: Electron.IpcMainInvokeEvent,
    options: DocumentOptions,
  ): Promise<string> {
    const sendProgress = this.activeProgressSender ?? ((progress: ProcessProgress) => {
      event.sender.send('process-progress', progress);
    });

    try {
      this.documentGenerator.validateOutputPath(options.outputPath);

      sendProgress({
        stage: 'blast-comparing',
        progress: options.subjectSequence?.trim() ? 76 : 88,
        message: options.subjectSequence?.trim() ? '正在补全 BLAST 对比结果...' : '未配置 BLAST 目标序列，跳过对比',
        current: 0,
        total: options.results.length,
        logLevel: 'info',
      });

      const blastResults = await this.ensureBlastResults(options);

      sendProgress({
        stage: 'generating-document',
        progress: 92,
        message: `正在生成文档，包含 ${options.results.length} 个结果分组`,
        current: options.results.length,
        total: options.results.length,
        logLevel: 'info',
      });

      const outputPath = await this.documentGenerator.generateDocument({
        ...options,
        blastResults,
      });

      sendProgress({
        stage: 'completed',
        progress: 100,
        message: `文档生成完成: ${outputPath}`,
        current: options.results.length,
        total: options.results.length,
        successCount: options.results.length,
        logLevel: 'info',
      });

      this.activeProgressSender = undefined;
      return outputPath;
    } catch (error) {
      sendProgress({
        stage: 'error',
        progress: 100,
        message: `文档生成失败: ${(error as Error).message}`,
        logLevel: 'error',
      });
      this.activeProgressSender = undefined;
      throw new Error(`Failed to generate document: ${error}`);
    }
  }

  /**
   * 清理临时目录。
   */
  private async handleCleanupTemp(): Promise<void> {
    try {
      await this.fileService.cleanupTempDirectories();
    } catch (error) {
      throw new Error(`Failed to cleanup temp directories: ${error}`);
    }
  }

  /**
   * 检查更新。
   */
  private async handleCheckForUpdates(): Promise<void> {
    try {
      if (!this.autoUpdaterService) {
        throw new Error('Auto-updater service not available');
      }

      await this.autoUpdaterService.checkForUpdates();
    } catch (error) {
      throw new Error(`Failed to check for updates: ${error}`);
    }
  }

  /**
   * 下载更新。
   */
  private async handleDownloadUpdate(): Promise<void> {
    try {
      if (!this.autoUpdaterService) {
        throw new Error('Auto-updater service not available');
      }

      await this.autoUpdaterService.downloadUpdate();
    } catch (error) {
      throw new Error(`Failed to download update: ${error}`);
    }
  }

  /**
   * 安装更新并退出程序。
   */
  private handleQuitAndInstall(): void {
    if (!this.autoUpdaterService) {
      throw new Error('Auto-updater service not available');
    }

    this.autoUpdaterService.quitAndInstall();
  }

  /**
   * 获取当前版本号。
   */
  private handleGetAppVersion(): string {
    try {
      if (this.autoUpdaterService) {
        return this.autoUpdaterService.getCurrentVersion();
      }

      // 在更新服务不可用时，退回到 package.json 读取版本，保证界面仍然可展示版本信息。
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require('../../../package.json').version;
    } catch (error) {
      throw new Error(`Failed to get app version: ${error}`);
    }
  }

  /**
   * 获取日志文件路径。
   */
  private handleGetLogPath(): string {
    try {
      return Logger.getLogPath();
    } catch (error) {
      throw new Error(`Failed to get log path: ${error}`);
    }
  }

  /**
   * 打开日志目录。
   */
  private async handleOpenLogFolder(): Promise<void> {
    try {
      const logPath = Logger.getLogPath();
      await shell.openPath(path.dirname(logPath));
    } catch (error) {
      throw new Error(`Failed to open log folder: ${error}`);
    }
  }

  /**
   * 兼容不同来源的 BLAST 结果结构。
   *
   * Electron IPC 在不同场景下可能把 `Map` 还原成：
   * 1. 真正的 `Map`
   * 2. 普通对象
   * 3. `undefined`
   *
   * 这里统一转成 `Map<string, BlastAlignment>`，后续文档生成逻辑只需要依赖一种结构。
   */
  private normalizeBlastResults(
    input: DocumentOptions['blastResults'] | Record<string, BlastAlignment> | undefined,
  ): Map<string, BlastAlignment> {
    if (!input) {
      return new Map<string, BlastAlignment>();
    }

    if (input instanceof Map) {
      return new Map<string, BlastAlignment>(input);
    }

    const normalized = new Map<string, BlastAlignment>();
    Object.entries(input).forEach(([key, value]) => {
      normalized.set(key, value);
    });
    return normalized;
  }

  /**
   * 确保文档生成阶段拿到真正可用的 BLAST 结果。
   *
   * 当前渲染进程传过来的 `blastResults` 可能为空 `Map`，
   * 这正是之前生成文档缺少 BLAST 内容的直接原因。
   *
   * 这里统一在主进程兜底：
   * 1. 如果前端已经算好并传了结果，则直接复用；
   * 2. 如果前端没传，但规则里配置了参考蛋白序列，则在这里补跑；
   * 3. 单个分组 BLAST 失败时不整体中断，而是记录日志并继续生成其他分组，
   *    这样用户至少能拿到完整文档，并在失败分组处看到“BLAST 缺失”而不是整个任务报错退出。
   */
  private async ensureBlastResults(options: DocumentOptions): Promise<Map<string, BlastAlignment>> {
    const existingResults = this.normalizeBlastResults(options.blastResults);
    if (existingResults.size > 0) {
      return existingResults;
    }

    const subjectSequence = options.subjectSequence?.trim();
    if (!subjectSequence) {
      return existingResults;
    }

    const progressSender = this.activeProgressSender;
    const eligibleResults = options.results.filter((result) => result.proteinSequence?.trim());
    const total = eligibleResults.length;
    let completed = 0;
    let successCount = 0;
    let failureCount = 0;

    const limiter = new ConcurrencyLimiter(2);
    const computedResults = new Map<string, BlastAlignment>();

    const tasks = eligibleResults.map((result) => {
      return async () => {
        progressSender?.({
          stage: 'blast-comparing',
          progress: this.computeStageProgress(completed, total, 76, 90),
          message: `正在进行 BLAST 对比: ${result.groupName}`,
          current: completed,
          total,
          successCount,
          failureCount,
          groupName: result.groupName,
          logLevel: 'info',
        });

        try {
          const alignment = await this.blastService.compareSequences(result.proteinSequence, subjectSequence);
          computedResults.set(result.groupName, alignment);
          completed += 1;
          successCount += 1;
          Logger.info(`[BLAST] Completed alignment for ${result.groupName}`);
          progressSender?.({
            stage: 'blast-comparing',
            progress: this.computeStageProgress(completed, total, 76, 90),
            message: `BLAST 完成: ${result.groupName}`,
            current: completed,
            total,
            successCount,
            failureCount,
            groupName: result.groupName,
            logLevel: 'info',
          });
        } catch (error) {
          completed += 1;
          failureCount += 1;
          const message = (error as Error).message;
          Logger.warn(`BLAST failed for group ${result.groupName}: ${message}`);
          progressSender?.({
            stage: 'blast-comparing',
            progress: this.computeStageProgress(completed, total, 76, 90),
            message: `BLAST 失败: ${result.groupName} - ${message}`,
            current: completed,
            total,
            successCount,
            failureCount,
            groupName: result.groupName,
            logLevel: 'warning',
          });
        }
      };
    });

    await limiter.runAll(tasks);
    return computedResults;
  }

  private computeStageProgress(current: number, total: number, start: number, end: number): number {
    if (total <= 0) {
      return end;
    }

    const safeCurrent = Math.min(Math.max(current, 0), total);
    const ratio = safeCurrent / total;
    return Math.round(start + (end - start) * ratio);
  }
}
