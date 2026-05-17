const { contextBridge, ipcRenderer } = require('electron');

console.log('[Preload CJS] Script loaded');

const electronAPI = {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectArchive: () => ipcRenderer.invoke('select-archive'),
  scanFiles: (path) => ipcRenderer.invoke('scan-files', path),
  generateOutputPath: (inputPath) => ipcRenderer.invoke('generate-output-path', inputPath),

  getRules: () => ipcRenderer.invoke('get-rules'),
  saveRule: (rule) => ipcRenderer.invoke('save-rule', rule),
  deleteRule: (id) => ipcRenderer.invoke('delete-rule', id),

  getConfig: (key) => ipcRenderer.invoke('get-config', key),
  saveConfig: (key, value) => ipcRenderer.invoke('save-config', key, value),

  processSequences: (options) => ipcRenderer.invoke('process-sequences', options),
  validateOutputPath: (outputPath) => ipcRenderer.invoke('validate-output-path', outputPath),
  generateDocument: (options) => ipcRenderer.invoke('generate-document', options),
  onProcessProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('process-progress', listener);
    return () => {
      ipcRenderer.removeListener('process-progress', listener);
    };
  },

  cleanupTemp: () => ipcRenderer.invoke('cleanup-temp'),

  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (_event, message) => callback(message));
  },

  getLogPath: () => ipcRenderer.invoke('get-log-path'),
  openLogFolder: () => ipcRenderer.invoke('open-log-folder'),
};

console.log('[Preload CJS] Exposing electronAPI to main world');
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
console.log('[Preload CJS] electronAPI exposed successfully');
