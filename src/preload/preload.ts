import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI, MergeRule, ProcessOptions, DocumentOptions, ProcessProgress } from '../shared/types';

// 调试：确认 preload 脚本已加载
console.log('[Preload] Script loaded');

// 通过contextBridge暴露安全的API给渲染进程
const electronAPI: ElectronAPI = {
  // 文件操作
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectArchive: () => ipcRenderer.invoke('select-archive'),
  scanFiles: (path: string) => ipcRenderer.invoke('scan-files', path),
  generateOutputPath: (inputPath: string) => ipcRenderer.invoke('generate-output-path', inputPath),
  
  // 规则管理
  getRules: () => ipcRenderer.invoke('get-rules'),
  saveRule: (rule: MergeRule) => ipcRenderer.invoke('save-rule', rule),
  deleteRule: (id: number) => ipcRenderer.invoke('delete-rule', id),
  
  // 配置
  getConfig: (key: string) => ipcRenderer.invoke('get-config', key),
  saveConfig: (key: string, value: any) => ipcRenderer.invoke('save-config', key, value),
  
  // 处理
  processSequences: (options: ProcessOptions) => ipcRenderer.invoke('process-sequences', options),
  generateDocument: (options: DocumentOptions) => ipcRenderer.invoke('generate-document', options),
  onProcessProgress: (callback: (progress: ProcessProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: ProcessProgress) => callback(progress);
    ipcRenderer.on('process-progress', listener);
    return () => {
      ipcRenderer.removeListener('process-progress', listener);
    };
  },

  // 清理
  cleanupTemp: () => ipcRenderer.invoke('cleanup-temp'),

  // 自动更新
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onUpdateStatus: (callback: (message: string) => void) => {
    ipcRenderer.on('update-status', (_event, message) => callback(message));
  },

  // 日志
  getLogPath: () => ipcRenderer.invoke('get-log-path'),
  openLogFolder: () => ipcRenderer.invoke('open-log-folder'),
};

console.log('[Preload] Exposing electronAPI to main world');
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
console.log('[Preload] electronAPI exposed successfully');
