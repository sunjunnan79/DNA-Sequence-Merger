// 共享类型定义

// 拼接规则相关类型
export interface FragmentRule {
  order: number;
  filePattern: string;  // 例如: "pETUpstream", "HpaB554"
  startSequence?: string;  // 例如: "ATGAAA"
  endSequence?: string;    // 例如: "ATGTTC"
  includeStart: boolean;
  includeEnd: boolean;
}

export interface MergeRule {
  id?: number;
  name: string;
  description?: string;
  subjectSequence?: string;  // 参考蛋白质序列（用于BLAST对比）
  fragments: FragmentRule[];
  createdAt: Date;
  updatedAt: Date;
}

// 文件相关类型
export interface SequenceFile {
  path: string;
  filename: string;
  group: string;  // 从文件名提取的组名，如 "(样本1)"
  pattern: string;  // 文件模式，如 "pETUpstream"
  size: number;
}

export interface FileGroup {
  groupName: string;
  files: SequenceFile[];
  isComplete: boolean;  // 是否包含所有必需的文件
  missingPatterns: string[];
}

// 处理相关类型
export interface ProcessOptions {
  rule: MergeRule;
  files: SequenceFile[];
}

export interface ProcessResult {
  groupName: string;
  dnaSequence: string;
  proteinSequence: string;
  warnings: string[];
}

export type ProcessStage =
  | 'idle'
  | 'preparing'
  | 'processing-groups'
  | 'processing-complete'
  | 'blast-comparing'
  | 'generating-document'
  | 'completed'
  | 'error';

export interface ProcessProgress {
  stage: ProcessStage;
  progress: number;
  message: string;
  current?: number;
  total?: number;
  successCount?: number;
  failureCount?: number;
  warningCount?: number;
  groupName?: string;
  logLevel?: 'info' | 'warning' | 'error';
}

// BLAST相关类型
export interface BlastRequest {
  query: string;
  subject: string;
}

export interface AlignmentGroup {
  query: {
    start: number;
    end: number;
    sequence: string;
  };
  match: string;
  subject: {
    start: number;
    end: number;
    sequence: string;
  };
}

export interface BlastAlignment {
  score: string;
  identities: string;
  expect: string;
  statisticLines?: string[];
  alignments: AlignmentGroup[];
}

// 文档生成相关类型
export interface DocumentOptions {
  outputPath: string;
  results: ProcessResult[];
  blastResults: Map<string, BlastAlignment>;
  subjectSequence: string;
}

// 日志相关类型
export interface LogEntry {
  timestamp: Date;
  level: 'info' | 'warning' | 'error';
  message: string;
}

// Electron API类型定义
export interface ElectronAPI {
  // 文件操作
  selectDirectory(): Promise<string>;
  selectArchive(): Promise<string>;
  scanFiles(path: string): Promise<FileGroup[]>;
  generateOutputPath(inputPath: string): Promise<string>;  // 根据输入路径生成输出路径
  
  // 规则管理
  getRules(): Promise<MergeRule[]>;
  saveRule(rule: MergeRule): Promise<MergeRule>;
  deleteRule(id: number): Promise<void>;
  
  // 配置
  getConfig(key: string): Promise<any>;
  saveConfig(key: string, value: any): Promise<void>;
  
  // 处理
  processSequences(options: ProcessOptions): Promise<ProcessResult[]>;
  generateDocument(options: DocumentOptions): Promise<string>;
  onProcessProgress(callback: (progress: ProcessProgress) => void): () => void;

  // 清理
  cleanupTemp(): Promise<void>;

  // 自动更新
  checkForUpdates(): Promise<void>;
  downloadUpdate(): Promise<void>;
  quitAndInstall(): Promise<void>;
  getAppVersion(): Promise<string>;
  onUpdateStatus(callback: (message: string) => void): void;

  // 日志
  getLogPath(): Promise<string>;
  openLogFolder(): Promise<void>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
