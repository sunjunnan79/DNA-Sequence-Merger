import { smithWaterman } from '@bioscript/seq-align';
import {
  FragmentTranslationResult,
  ProcessOptions,
  ProcessResult,
  ReadingFrameTranslation,
} from '../../shared/types';
import { FileService } from './file.service';
import { Logger } from '../utils/logger';
import { LocalTranslationService, TranslationFrame, TranslationService } from './translation.service';

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
  private translationService: TranslationService;

  constructor(fileService: FileService, translationService?: TranslationService) {
    this.fileService = fileService;
    this.translationService =
      translationService || new LocalTranslationService((dnaSequence, frame) => this.translateToProteinFromFrame(dnaSequence, frame));
  }

  /**
   * 将DNA序列翻译为蛋白质序列
   * @param dnaSequence DNA序列（只包含A、T、G、C）
   * @returns 蛋白质序列（氨基酸单字母代码）
   */
  translateToProtein(dnaSequence: string): string {
    return this.translateToProteinFromFrame(dnaSequence, 0);
  }

  /**
   * 按指定阅读框翻译 DNA 序列。
   *
   * frame=0 表示从第 1 个碱基开始，frame=1/2 表示分别跳过开头 1/2 个碱基。
   * 测序反向读数在截取和反向互补后，开头经常会残留 1-2 个非编码碱基；
   * 单独暴露这个方法可以让后续逻辑同时评估三个阅读框，避免被错误阅读框的提前终止误导。
   */
  private translateToProteinFromFrame(dnaSequence: string, frame: number): string {
    // 确保序列是大写
    const sequence = dnaSequence.toUpperCase();
    let protein = '';

    // 每3个碱基翻译为1个氨基酸
    for (let i = frame; i < sequence.length - 2; i += 3) {
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
   * 同时评估 0/1/2 三个阅读框，并选出最可信的一帧。
   *
   * 如果规则里有参考蛋白序列，优先使用第三方包 `@bioscript/seq-align` 的
   * Smith-Waterman 局部比对结果选帧；如果没有参考序列，再退回到“终止前最长”。
   * 这样既能处理截取边界多出 1-2 个碱基导致的移码，也能利用参考序列判断局部正确性。
   */
  async translateBestReadingFrame(dnaSequence: string, referenceProtein?: string): Promise<{
    selectedFrame: number;
    proteinSequence: string;
    selectionMethod: 'reference-alignment' | 'longest-open-reading-frame';
    alignmentScore?: number;
    identityPercent?: number;
    readingFrames: ReadingFrameTranslation[];
  }> {
    const normalizedReference = referenceProtein?.trim().toUpperCase();
    const translatedFrames = await this.translateWithFallback(dnaSequence);
    const forwardFrames = translatedFrames
      .filter((frame) => frame.strand === 'forward')
      .sort((a, b) => a.frame - b.frame);
    const framesForSelection =
      forwardFrames.length > 0
        ? forwardFrames
        : [0, 1, 2].map((frame) => ({
            strand: 'forward' as const,
            frame,
            proteinSequence: this.translateToProteinFromFrame(dnaSequence, frame),
          }));

    const readingFrames = framesForSelection.map((frameResult) => {
      const proteinSequence = this.pickBestOpenReadingFrame(frameResult.proteinSequence, normalizedReference);
      const result: ReadingFrameTranslation = {
        frame: frameResult.frame,
        proteinSequence,
        proteinLength: proteinSequence.length,
      };

      if (normalizedReference && proteinSequence.length > 0) {
        // 使用成熟的 Smith-Waterman 局部比对为阅读框打分。
        // 参考蛋白通常比测序片段更长，因此局部比对能自然找到片段在参考序列中的最佳匹配区间，
        // 比单纯比较“终止前长度”更适合判断哪个阅读框真正可信。
        const alignment = smithWaterman(proteinSequence, normalizedReference, {
          matrix: 'BLOSUM62',
          gapOpen: -10,
          gapExtend: -1,
        });
        result.alignmentScore = alignment.score;
        result.identityPercent = alignment.identityPercent;
      }

      return result;
    });

    const hasReferenceAlignment = readingFrames.some((frame) => frame.alignmentScore !== undefined);
    const bestFrame = readingFrames.reduce((best, current) => {
      if (hasReferenceAlignment) {
        const currentScore = current.alignmentScore ?? Number.NEGATIVE_INFINITY;
        const bestScore = best.alignmentScore ?? Number.NEGATIVE_INFINITY;
        if (currentScore > bestScore) {
          return current;
        }
        if (currentScore === bestScore && current.proteinLength > best.proteinLength) {
          return current;
        }
        return best;
      }

      if (current.proteinLength > best.proteinLength) {
        return current;
      }
      return best;
    });

    return {
      selectedFrame: bestFrame.frame,
      proteinSequence: bestFrame.proteinSequence,
      selectionMethod: hasReferenceAlignment ? 'reference-alignment' : 'longest-open-reading-frame',
      alignmentScore: bestFrame.alignmentScore,
      identityPercent: bestFrame.identityPercent,
      readingFrames,
    };
  }

  /**
   * 调用外部翻译服务；如果网络或服务端异常，自动退回本地三帧翻译。
   *
   * 处理流程不应该因为 Expasy 临时不可用而完全中断，所以这里把失败降级为警告日志。
   */
  private async translateWithFallback(dnaSequence: string): Promise<TranslationFrame[]> {
    try {
      return await this.translationService.translate(dnaSequence);
    } catch (error) {
      Logger.warn(`[SequenceProcessor] Expasy translation failed, fallback to local translation: ${(error as Error).message}`);
      return new LocalTranslationService((sequence, frame) => this.translateToProteinFromFrame(sequence, frame)).translate(dnaSequence);
    }
  }

  /**
   * Expasy compact FASTA 用 `-` 表示终止密码子。
   *
   * 网页上用户通常会在某一阅读框内选择一段 ORF；迁移到自动流程后，我们将每个阅读框按 `-`
   * 切成多个开放读码片段：有参考蛋白时选 Smith-Waterman 得分最高的片段，没有参考蛋白时选最长片段。
   */
  private pickBestOpenReadingFrame(proteinWithStops: string, referenceProtein?: string): string {
    const candidates = proteinWithStops
      .split('-')
      .map((candidate) => candidate.replace(/[^A-Z]/g, ''))
      .filter((candidate) => candidate.length > 0);

    if (candidates.length === 0) {
      return '';
    }

    if (!referenceProtein) {
      return candidates.reduce((best, current) => (current.length > best.length ? current : best));
    }

    return candidates.reduce((best, current) => {
      const currentAlignment = smithWaterman(current, referenceProtein, {
        matrix: 'BLOSUM62',
        gapOpen: -10,
        gapExtend: -1,
      });
      const bestAlignment = smithWaterman(best, referenceProtein, {
        matrix: 'BLOSUM62',
        gapOpen: -10,
        gapExtend: -1,
      });

      if (currentAlignment.score > bestAlignment.score) {
        return current;
      }
      if (currentAlignment.score === bestAlignment.score && current.length > best.length) {
        return current;
      }
      return best;
    });
  }

  /**
   * 生成 DNA 序列的反向互补链。
   *
   * 这里先逐碱基取互补，再整体反转，符合常规 5'->3' 方向的反向互补定义。
   * 对于测序文件中偶尔出现的未知碱基或 IUPAC 扩展字符，能识别的会尽量互补，
   * 无法识别的字符保留为 N，避免把异常字符静默带入后续翻译。
   */
  reverseComplement(dnaSequence: string): string {
    const complementTable: Record<string, string> = {
      A: 'T',
      T: 'A',
      G: 'C',
      C: 'G',
      U: 'A',
      R: 'Y',
      Y: 'R',
      S: 'S',
      W: 'W',
      K: 'M',
      M: 'K',
      B: 'V',
      V: 'B',
      D: 'H',
      H: 'D',
      N: 'N',
    };

    return dnaSequence
      .toUpperCase()
      .split('')
      .reverse()
      .map((base) => complementTable[base] || 'N')
      .join('');
  }

  /**
   * 根据规则拼接序列
   * @param options 处理选项，包含规则和文件列表
   * @returns 处理结果
   */
  async mergeSequences(options: ProcessOptions): Promise<ProcessResult> {
    const { rule, files } = options;
    const warnings: string[] = [];
    const fragmentTranslations: FragmentTranslationResult[] = [];
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
        let fragment = this.extractFragment(
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

        if (fragmentRule.reverseComplement) {
          // 用户启用反向互补时，先按原始文件方向完成起止序列匹配和片段截取，
          // 再仅对截取出来的片段执行反向互补。这样标记序列更容易按原始测序结果查找，
          // 同时不会影响同一规则中其他片段的匹配方向。
          Logger.info(
            `[SequenceProcessor] Applying reverse complement after fragment extraction: ${matchingFile.filename}`,
          );
          fragment = this.reverseComplement(fragment);
        }

        Logger.info(
          `[SequenceProcessor] Extracted fragment from ${matchingFile.filename} successfully (length=${fragment.length})`,
        );

        // 记录每个成功片段自己的翻译结果，方便在生成文档后回看是哪一段引入了异常氨基酸。
        // 这里按片段自身的第一个碱基作为阅读框翻译，和最终拼接后整体翻译互不替代。
        const fragmentTranslation = await this.translateBestReadingFrame(fragment, rule.subjectSequence);
        fragmentTranslations.push({
          order: fragmentRule.order,
          filePattern: fragmentRule.filePattern,
          filename: matchingFile.filename,
          dnaLength: fragment.length,
          proteinSequence: fragmentTranslation.proteinSequence,
          selectedFrame: fragmentTranslation.selectedFrame,
          selectionMethod: fragmentTranslation.selectionMethod,
          alignmentScore: fragmentTranslation.alignmentScore,
          identityPercent: fragmentTranslation.identityPercent,
          readingFrames: fragmentTranslation.readingFrames,
          reverseComplement: fragmentRule.reverseComplement === true,
        });

        // 拼接片段
        mergedDNA += fragment;
      } catch (error) {
        // 文件读取失败，记录警告
        const warningMessage = `Failed to read file ${matchingFile.filename}: ${error}`;
        Logger.warn(`[SequenceProcessor] ${warningMessage}`);
        warnings.push(warningMessage);
      }
    }

    // 翻译拼接后的 DNA 序列为蛋白质序列。
    // 这里同样选择三阅读框中终止前最长的一帧，避免测序片段边界多出 1-2 个碱基时导致整体结果异常变短。
    const mergedTranslation = await this.translateBestReadingFrame(mergedDNA, rule.subjectSequence);

    // 提取组名（假设所有文件属于同一组）
    const groupName = files.length > 0 ? files[0].group : 'Unknown';

    return {
      groupName,
      dnaSequence: mergedDNA,
      proteinSequence: mergedTranslation.proteinSequence,
      proteinReadingFrame: mergedTranslation.selectedFrame,
      proteinSelectionMethod: mergedTranslation.selectionMethod,
      proteinAlignmentScore: mergedTranslation.alignmentScore,
      proteinIdentityPercent: mergedTranslation.identityPercent,
      fragmentTranslations,
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
