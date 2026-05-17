import type { DocumentOptions, ElectronAPI, MergeRule, ProcessOptions, ProcessProgress } from '../shared/types';

/**
 * 浏览器预览环境的最小 Electron API 兼容层。
 *
 * 真正的桌面程序会由 preload 注入 `window.electronAPI`；Codex 的 in-app browser
 * 直接打开 Vite 页面时没有 preload。为了让规则编辑不再卡在“系统初始化中”，
 * 开发环境下用 Vite 中间件读写同一个本地规则数据库。
 */
export function installDevElectronApi(): void {
  const isElectronRenderer = navigator.userAgent.includes('Electron');

  if (window.electronAPI || !import.meta.env.DEV || isElectronRenderer) {
    return;
  }

  const unsupported = async (): Promise<never> => {
    throw new Error('浏览器预览不支持该桌面能力，请在 DNA Sequence Merger 桌面窗口中执行。');
  };

  window.electronAPI = {
    selectDirectory: unsupported,
    selectArchive: unsupported,
    scanFiles: unsupported,
    generateOutputPath: async (inputPath: string) => `${inputPath.replace(/[\\/]*$/, '')}/DNA_Results.docx`,

    getRules: async () => requestJson<MergeRule[]>('/__dev-api/rules'),
    saveRule: async (rule: MergeRule) =>
      requestJson<MergeRule>('/__dev-api/rules', {
        method: 'POST',
        body: JSON.stringify(rule),
      }),
    deleteRule: async (id: number) => {
      await requestJson(`/__dev-api/rules/${id}`, { method: 'DELETE' });
    },

    getConfig: async (key: string) => {
      const raw = localStorage.getItem(`dev-config:${key}`);
      return raw ? JSON.parse(raw) : undefined;
    },
    saveConfig: async (key: string, value: unknown) => {
      localStorage.setItem(`dev-config:${key}`, JSON.stringify(value));
    },

    processSequences: unsupported as (options: ProcessOptions) => Promise<never>,
    validateOutputPath: unsupported as (outputPath: string) => Promise<never>,
    generateDocument: unsupported as (options: DocumentOptions) => Promise<never>,
    onProcessProgress: (_callback: (progress: ProcessProgress) => void) => () => undefined,
    cleanupTemp: async () => undefined,

    checkForUpdates: async () => undefined,
    downloadUpdate: async () => undefined,
    quitAndInstall: async () => undefined,
    getAppVersion: async () => 'dev-browser-preview',
    onUpdateStatus: () => undefined,

    getLogPath: async () => '',
    openLogFolder: async () => undefined,
  } satisfies ElectronAPI;

  console.info('[DevElectronAPI] Browser preview fallback installed');
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  const data = await response.json();
  if (!response.ok || data?.error) {
    throw new Error(data?.error || `Dev API request failed: ${response.status}`);
  }

  return data as T;
}
