import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { SequenceFile, FileGroup } from '../../shared/types';
import { Logger } from '../utils/logger';

export class FileService {
  private tempDirectories: Set<string> = new Set(); // 跟踪临时目录以便清理

  /**
   * 清理所有临时目录
   * 释放磁盘空间和内存
   */
  async cleanupTempDirectories(): Promise<void> {
    for (const dir of this.tempDirectories) {
      try {
        await fs.promises.rm(dir, { recursive: true, force: true });
        this.tempDirectories.delete(dir);
      } catch (error) {
        Logger.warn(`Failed to cleanup temp directory ${dir}: ${(error as Error).message}`);
      }
    }
  }

  /**
   * 清理单个临时目录
   * @param dirPath 要清理的目录路径
   */
  async cleanupTempDirectory(dirPath: string): Promise<void> {
    try {
      await fs.promises.rm(dirPath, { recursive: true, force: true });
      this.tempDirectories.delete(dirPath);
    } catch (error) {
      Logger.warn(`Failed to cleanup temp directory ${dirPath}: ${(error as Error).message}`);
    }
  }
  /**
   * 递归扫描目录，查找所有.seq文件
   * @param dirPath 要扫描的目录路径
   * @returns 找到的序列文件列表
   */
  async scanDirectory(dirPath: string): Promise<SequenceFile[]> {
    const files: SequenceFile[] = [];
    
    try {
      // 检查路径是否存在
      try {
        await fs.promises.access(dirPath, fs.constants.R_OK);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error(`Directory does not exist: ${dirPath}`);
        } else if ((error as NodeJS.ErrnoException).code === 'EACCES') {
          throw new Error(`Permission denied: Cannot read directory ${dirPath}`);
        }
        throw error;
      }

      // 检查是否是目录
      const stats = await fs.promises.stat(dirPath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${dirPath}`);
      }

      await this.scanDirectoryRecursive(dirPath, files);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Directory does not exist')) {
        throw error;
      }
      if (error instanceof Error && error.message.includes('Permission denied')) {
        throw error;
      }
      if (error instanceof Error && error.message.includes('Path is not a directory')) {
        throw error;
      }
      throw new Error(`Failed to scan directory ${dirPath}: ${(error as Error).message}`);
    }
    
    return files;
  }

  /**
   * 递归扫描目录的辅助方法
   */
  private async scanDirectoryRecursive(dirPath: string, files: SequenceFile[]): Promise<void> {
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        try {
          if (entry.isDirectory()) {
            // 递归扫描子目录
            await this.scanDirectoryRecursive(fullPath, files);
          } else if (entry.isFile()) {
            // 检查文件扩展名 - 只处理.seq文件
            const ext = path.extname(entry.name).toLowerCase();
            if (ext === '.seq') {
              try {
                const stats = await fs.promises.stat(fullPath);
                const sequenceFile = this.parseSequenceFile(fullPath, entry.name, stats.size);
                files.push(sequenceFile);
                Logger.info(`[FileService] Parsed filename successfully: ${entry.name} -> group=${sequenceFile.group || 'none'}, pattern=${sequenceFile.pattern}`);
              } catch (error) {
                // 记录警告但继续处理其他文件
                Logger.warn(`Warning: Could not process file ${fullPath}: ${(error as Error).message}`);
              }
            }
          }
        } catch (error) {
          // 记录警告但继续处理其他文件
          Logger.warn(`Warning: Could not access ${fullPath}: ${(error as Error).message}`);
        }
      }
    } catch (error) {
      const errCode = (error as NodeJS.ErrnoException).code;
      if (errCode === 'EACCES') {
        throw new Error(`Permission denied: Cannot read directory ${dirPath}`);
      }
      throw error;
    }
  }

  /**
   * 从文件名解析组名和文件模式
   * 支持两种格式：
   * 1. 旧格式: "pETUpstream(样本1).ab1" -> group: "(样本1)", pattern: "pETUpstream"
   * 2. 新格式: "0001_32725041600027_(T292A-1)_[DuetDOWN1].ab1" -> group: "(T292A-1)", pattern: "DuetDOWN1"
   */
  private parseSequenceFile(filePath: string, filename: string, size: number): SequenceFile {
    // 提取组名（圆括号内的内容）
    const groupMatch = filename.match(/\(([^)]+)\)/);
    const group = groupMatch ? `(${groupMatch[1]})` : '';
    
    // 提取文件模式
    let pattern = '';
    
    // 首先尝试从方括号中提取模式（新格式）
    const bracketMatch = filename.match(/\[([^\]]+)\]/);
    if (bracketMatch) {
      // 新格式：使用方括号中的内容作为模式
      pattern = bracketMatch[1].trim();
    } else if (groupMatch) {
      // 旧格式：使用圆括号之前的部分作为模式
      pattern = filename.substring(0, groupMatch.index).trim();
    } else {
      // 没有组名和方括号，使用整个文件名（去除扩展名）
      pattern = path.basename(filename, path.extname(filename)).trim();
    }
    
    Logger.info(`[FileService] Parsed file: ${filename}`);
    Logger.info(`[FileService]   Group: ${group || 'none'}`);
    Logger.info(`[FileService]   Pattern: ${pattern}`);

    return {
      path: filePath,
      filename,
      group,
      pattern,
      size,
    };
  }

  /**
   * 解压压缩包到临时目录
   * @param archivePath 压缩包路径
   * @param targetDir 目标目录（可选，默认使用临时目录）
   * @returns 解压后的目录路径
   */
  async extractArchive(archivePath: string, targetDir?: string): Promise<string> {
    // 检查文件是否存在
    try {
      await fs.promises.access(archivePath, fs.constants.R_OK);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Archive file does not exist: ${archivePath}`);
      } else if ((error as NodeJS.ErrnoException).code === 'EACCES') {
        throw new Error(`Permission denied: Cannot read archive file ${archivePath}`);
      }
      throw new Error(`Cannot access archive file ${archivePath}: ${(error as Error).message}`);
    }

    const ext = path.extname(archivePath).toLowerCase();
    
    // 目前只支持.zip格式
    if (ext !== '.zip') {
      throw new Error(`Unsupported archive format: ${ext}. Only .zip is currently supported.`);
    }
    
    try {
      // 如果没有指定目标目录，创建临时目录
      if (!targetDir) {
        const tmpDir = path.join(process.cwd(), 'temp', `extract_${Date.now()}`);
        try {
          await fs.promises.mkdir(tmpDir, { recursive: true });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'EACCES') {
            throw new Error(`Permission denied: Cannot create temporary directory ${tmpDir}`);
          }
          throw new Error(`Failed to create temporary directory: ${(error as Error).message}`);
        }
        targetDir = tmpDir;
        // 跟踪临时目录以便后续清理
        this.tempDirectories.add(targetDir);
      }
      
      // 使用adm-zip解压
      try {
        const zip = new AdmZip(archivePath);
        zip.extractAllTo(targetDir, true);
      } catch (error) {
        throw new Error(`Failed to extract archive (corrupted or invalid format): ${(error as Error).message}`);
      }
      
      return targetDir;
    } catch (error) {
      if (error instanceof Error && 
          (error.message.includes('Permission denied') || 
           error.message.includes('Failed to extract archive') ||
           error.message.includes('Failed to create temporary directory'))) {
        throw error;
      }
      throw new Error(`Failed to extract archive ${archivePath}: ${(error as Error).message}`);
    }
  }

  /**
   * 根据组名对文件进行分组
   * @param files 序列文件列表
   * @returns 文件分组列表
   */
  groupFiles(files: SequenceFile[]): FileGroup[] {
    // 按组名分组
    const groupMap = new Map<string, SequenceFile[]>();
    
    for (const file of files) {
      if (!file.group) {
        // 如果文件没有组名，跳过
        continue;
      }
      
      if (!groupMap.has(file.group)) {
        groupMap.set(file.group, []);
      }
      groupMap.get(file.group)!.push(file);
    }
    
    // 转换为FileGroup数组
    const fileGroups: FileGroup[] = [];
    
    for (const [groupName, groupFiles] of groupMap.entries()) {
      fileGroups.push({
        groupName,
        files: groupFiles,
        isComplete: true,  // 暂时设为true，后续会根据规则检查
        missingPatterns: [],
      });
    }
    
    return fileGroups;
  }

  /**
   * 检查文件分组是否包含所有必需的文件模式
   * @param groups 文件分组列表
   * @param requiredPatterns 必需的文件模式列表
   * @returns 更新后的文件分组列表
   */
  checkGroupCompleteness(groups: FileGroup[], requiredPatterns: string[]): FileGroup[] {
    return groups.map(group => {
      const existingPatterns = new Set(group.files.map(f => f.pattern));
      const missingPatterns = requiredPatterns.filter(p => !existingPatterns.has(p));
      
      return {
        ...group,
        isComplete: missingPatterns.length === 0,
        missingPatterns,
      };
    });
  }

  /**
   * 读取序列文件内容
   * @param filePath 文件路径
   * @returns 纯序列数据（去除头部信息）
   */
  async readSequenceFile(filePath: string): Promise<string> {
    // 检查文件是否存在
    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Sequence file does not exist: ${filePath}`);
      } else if ((error as NodeJS.ErrnoException).code === 'EACCES') {
        throw new Error(`Permission denied: Cannot read sequence file ${filePath}`);
      }
      throw new Error(`Cannot access sequence file ${filePath}: ${(error as Error).message}`);
    }

    const ext = path.extname(filePath).toLowerCase();
    
    try {
      if (ext === '.seq' || ext === '.txt') {
        // 文本格式，直接读取
        const content = await fs.promises.readFile(filePath, 'utf-8');
        return this.extractSequenceFromText(content);
      } else {
        throw new Error(`Unsupported file format: ${ext}. Only .seq files are supported.`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Unsupported file format')) {
        throw error;
      }
      throw new Error(`Failed to read sequence file ${filePath}: ${(error as Error).message}`);
    }
  }

  /**
   * 从文本内容中提取纯序列数据
   * 去除FASTA头部、空格、换行符等
   */
  private extractSequenceFromText(content: string): string {
    // 去除FASTA头部（以>开头的行）
    const lines = content.split('\n');
    const sequenceLines = lines.filter(line => !line.startsWith('>'));
    
    // 合并所有序列行，去除空格和换行符
    const sequence = sequenceLines.join('').replace(/\s/g, '').toUpperCase();
    
    return sequence;
  }
}
