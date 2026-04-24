import { ProcessOptions, ProcessResult } from '../../shared/types';
import { FileService } from './file.service';
import { Logger } from '../utils/logger';

/**
 * 遗传密码表 - 将DNA密码子翻译为氨基酸
 */
const CODON_TABLE: Record<string, string> = {
  'ATA': 'I', 'ATC': 'I', 'ATT': 'I', 'ATG': 'M',
  'ACA': 'T', 'ACC': 'T', 'ACG': 'T', 'ACT': 'T',
  'AAC': 'N', 'AAT': 'N', 'AAA': 'K', 'AAG': 'K',
  'AGC': 'S', 'AGT': 'S', 'AGA': 'R', 'AGG': 'R',
  'CTA': 'L', 'CTC': 'L', 'CTG': 'L', 'CTT': 'L',
  'CCA': 'P', 'CCC': 'P', 'CCG': 'P', 'CCT': 'P',
  'CAC': 'H', 'CAT': 'H', 'CAA': 'Q', 'CAG': 'Q',
  'CGA': 'R', 'CGC': 'R', 'CGG': 'R', 'CGT': 'R',
  'GTA': 'V', 'GTC': 'V', 'GTG': 'V', 'GTT': 'V',
  'GCA': 'A', 'GCC': 'A', 'GCG': 'A', 'GCT': 'A',
  'GAC': 'D', 'GAT': 'D', 'GAA': 'E', 'GAG': 'E',
  'GGA': 'G', 'GGC': 'G', 'GGG': 'G', 'GGT': 'G',
  'TCA': 'S', 'TCC': 'S', 'TCG': 'S', 'TCT': 'S',
  'TTC': 'F', 'TTT': 'F', 'TTA': 'L', 'TTG': 'L',
  'TAC': 'Y', 'TAT': 'Y', 'TAA': '_', 'TAG': '_',
  'TGC': 'C', 'TGT': 'C', 'TGA': '_', 'TGG': 'W',
};

/**
 * 序列处理器 - 负责DNA序列的拼接、翻译等操作
 */
export class SequenceProcessor {
  private fileService: FileService;

  constructor(fileService: FileService) {
    this.fileService = fileService;
  }

  /**
   * 将DNA序列翻译为蛋白质序列
   * @param dnaSequence DNA序列（只包含A、T、G、C）
   * @returns 蛋白质序列（氨基酸单字母代码）
   */
  translateToProtein(dnaSequence: string): string {
    // 确保序列是大写
    const sequence = dnaSequence.toUpperCase();
    let protein = '';

    // 每3个碱基翻译为1个氨基酸
    for (let i = 0; i < sequence.length - 2; i += 3) {
      const codon = sequence.substring(i, i + 3);
      
      // 查找密码子对应的氨基酸
      const aminoAcid = CODON_TABLE[codon];
      
      if (aminoAcid === '_') {
        // 遇到终止密码子，停止翻译
        break;
      } else if (aminoAcid) {
        // 有效密码子，添加氨基酸
        protein += aminoAcid;
      } else {
        // 无效密码子，翻译为X（未知氨基酸）
        protein += 'X';
      }
    }

    return protein;
  }

  /**
   * 根据规则拼接序列
   * @param options 处理选项，包含规则和文件列表
   * @returns 处理结果
   */
  async mergeSequences(options: ProcessOptions): Promise<ProcessResult> {
    const { rule, files } = options;
    const warnings: string[] = [];
    let mergedDNA = '';

    Logger.info(`[SequenceProcessor] Processing group with rule: ${rule.name}`);
    Logger.info(`[SequenceProcessor] Available files: ${files.map(f => `${f.pattern} (${f.filename})`).join(', ')}`);
    Logger.info(`[SequenceProcessor] Required patterns: ${rule.fragments.map(f => f.filePattern).join(', ')}`);

    // 按照规则中定义的顺序处理每个片段
    for (const fragmentRule of rule.fragments.sort((a, b) => a.order - b.order)) {
      Logger.info(`[SequenceProcessor] Looking for pattern: "${fragmentRule.filePattern}"`);

      // 查找匹配的文件
      const matchingFile = files.find(f => f.pattern === fragmentRule.filePattern);

      if (!matchingFile) {
        // 文件缺失，记录警告并跳过
        Logger.warn(`[SequenceProcessor] Missing file for pattern: "${fragmentRule.filePattern}"`);
        warnings.push(`Missing file for pattern: ${fragmentRule.filePattern}`);
        continue;
      }

      Logger.info(`[SequenceProcessor] Found matching file: ${matchingFile.filename}`);

      try {
        // 读取序列文件
        let sequence = await this.fileService.readSequenceFile(matchingFile.path);
        
        // 根据规则提取片段
        const fragment = this.extractFragment(
          sequence,
          fragmentRule.startSequence,
          fragmentRule.endSequence,
          fragmentRule.includeStart,
          fragmentRule.includeEnd
        );

        // 立即释放原始序列的内存引用
        sequence = '';

        if (!fragment) {
          // 提取失败（可能是标记未找到），记录警告
          const warningMessage =
            `Failed to extract fragment from ${matchingFile.filename}: ` +
            `start="${fragmentRule.startSequence || 'none'}", ` +
            `end="${fragmentRule.endSequence || 'none'}"`;
          Logger.warn(`[SequenceProcessor] ${warningMessage}`);
          warnings.push(warningMessage);
          continue;
        }

        Logger.info(
          `[SequenceProcessor] Extracted fragment from ${matchingFile.filename} successfully (length=${fragment.length})`,
        );

        // 拼接片段
        mergedDNA += fragment;
      } catch (error) {
        // 文件读取失败，记录警告
        const warningMessage = `Failed to read file ${matchingFile.filename}: ${error}`;
        Logger.warn(`[SequenceProcessor] ${warningMessage}`);
        warnings.push(warningMessage);
      }
    }

    // 翻译DNA序列为蛋白质序列
    const proteinSequence = this.translateToProtein(mergedDNA);

    // 提取组名（假设所有文件属于同一组）
    const groupName = files.length > 0 ? files[0].group : 'Unknown';

    return {
      groupName,
      dnaSequence: mergedDNA,
      proteinSequence,
      warnings,
    };
  }

  /**
   * 从序列中提取片段
   * 
   * 重要：此方法模拟Python代码的行为，即先根据起始标记切片，然后在切片后的序列中查找结束标记
   * 
   * @param sequence 原始序列
   * @param startPattern 起始标记序列（可选）
   * @param endPattern 结束标记序列（可选）
   * @param includeStart 是否包含起始标记
   * @param includeEnd 是否包含结束标记
   * @returns 提取的片段
   */
  extractFragment(
    sequence: string,
    startPattern?: string,
    endPattern?: string,
    includeStart: boolean = false,
    includeEnd: boolean = false
  ): string {
    Logger.info(`[SequenceProcessor] Extracting fragment:`);
    Logger.info(`[SequenceProcessor]   Original sequence length: ${sequence.length}`);
    Logger.info(`[SequenceProcessor]   Start pattern: ${startPattern || 'none'} (include: ${includeStart})`);
    Logger.info(`[SequenceProcessor]   End pattern: ${endPattern || 'none'} (include: ${includeEnd})`);
    
    let workingSequence = sequence;

    // 处理起始标记 - 先切片序列
    if (startPattern) {
      const startPos = workingSequence.indexOf(startPattern);
      Logger.info(`[SequenceProcessor]   Start pattern found at position: ${startPos}`);
      
      if (startPos === -1) {
        // 未找到起始标记，返回空字符串
        Logger.info(`[SequenceProcessor]   Start pattern not found, returning empty`);
        return '';
      }
      
      if (includeStart) {
        // 包含起始标记，从标记开始切片
        workingSequence = workingSequence.substring(startPos);
      } else {
        // 不包含起始标记，从标记后开始切片
        workingSequence = workingSequence.substring(startPos + startPattern.length);
      }
      Logger.info(`[SequenceProcessor]   After start pattern, sequence length: ${workingSequence.length}`);
      Logger.info(`[SequenceProcessor]   Sequence starts with: ${workingSequence.substring(0, 20)}...`);
    }

    // 处理结束标记 - 在已切片的序列中查找
    if (endPattern) {
      const endPos = workingSequence.indexOf(endPattern);
      Logger.info(`[SequenceProcessor]   End pattern found at position: ${endPos} (in sliced sequence)`);
      
      if (endPos === -1) {
        // 未找到结束标记，使用整个切片后的序列
        Logger.info(`[SequenceProcessor]   End pattern not found, using entire sliced sequence`);
      } else {
        if (includeEnd) {
          // 包含结束标记
          workingSequence = workingSequence.substring(0, endPos + endPattern.length);
        } else {
          // 不包含结束标记，在标记前结束
          workingSequence = workingSequence.substring(0, endPos);
        }
        Logger.info(`[SequenceProcessor]   After end pattern, sequence length: ${workingSequence.length}`);
      }
    }

    Logger.info(`[SequenceProcessor]   Final fragment length: ${workingSequence.length}`);
    if (workingSequence.length > 0) {
      Logger.info(`[SequenceProcessor]   Fragment starts with: ${workingSequence.substring(0, Math.min(30, workingSequence.length))}...`);
      Logger.info(`[SequenceProcessor]   Fragment ends with: ...${workingSequence.substring(Math.max(0, workingSequence.length - 30))}`);
    }
    
    return workingSequence;
  }
}
