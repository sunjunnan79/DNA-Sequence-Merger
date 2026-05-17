import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import * as fs from 'fs';
import * as path from 'path';
import type {
  AlignmentGroup,
  BlastAlignment,
  DocumentOptions,
  ProcessResult,
  ReadingFrameTranslation,
} from '../../shared/types';

/**
 * Word 文档生成器。
 *
 * 这里专门按旧版 Python 产物的结构来组织文档内容，
 * 这样我们在对照“旧版 Python 输出”和“当前 Electron 输出”时，
 * 可以尽量把差异收敛到真正的业务逻辑，而不是被排版噪音干扰。
 */
export class DocumentGenerator {
  /**
   * 对外提供目标路径可写性检查，供主流程在耗时任务开始前提前失败。
   *
   * `generateDocument` 内部仍会再检查一次，避免未来有其他调用方绕过 IPC 直接写文档。
   */
  validateOutputPath(outputPath: string): void {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    this.assertOutputPathWritable(outputPath);
  }

  /**
   * 生成最终的 Word 文档。
   *
   * @param options 文档生成参数
   * @returns 最终输出文件路径
   */
  async generateDocument(options: DocumentOptions): Promise<string> {
    const { outputPath, results, blastResults } = options;

    this.validateOutputPath(outputPath);

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: this.createDocumentContent(results, blastResults),
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(outputPath, buffer);

    return outputPath;
  }

  /**
   * 组装文档正文。
   *
   * 每个分组保持如下顺序：
   * 1. 分组名
   * 2. 蛋白序列
   * 3. 可选警告
   * 4. 空行
   * 5. BLAST 标题和统计信息
   * 6. BLAST 对齐表格
   * 7. 空行
   */
  private createDocumentContent(
    results: ProcessResult[],
    blastResults: Map<string, BlastAlignment>,
  ): Array<Paragraph | Table> {
    const content: Array<Paragraph | Table> = [];

    for (const result of results) {
      content.push(
        new Paragraph({
          text: result.groupName,
          spacing: { after: 120 },
        }),
      );

      this.addProteinSequenceSection(content, result);

      this.addFragmentTranslationSection(content, result);

      if (result.warnings.length > 0) {
        content.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `Warnings: ${result.warnings.join('; ')}`,
                color: 'CC3300',
              }),
            ],
            spacing: { after: 120 },
          }),
        );
      }

      content.push(new Paragraph({ text: '' }));

      const blastResult = blastResults.get(result.groupName);
      if (blastResult) {
        this.addBlastSection(content, blastResult);
      } else {
        content.push(
          new Paragraph({
            children: [
              new TextRun({
                text: 'BLAST result is unavailable for this group.',
                color: 'CC3300',
              }),
            ],
          }),
        );
      }

      content.push(new Paragraph({ text: '' }));
    }

    return content;
  }

  /**
   * 追加每个规则片段单独翻译得到的氨基酸序列。
   *
   * 最终蛋白序列是“全部 DNA 拼接后再整体翻译”的结果；
   * 这里展示的是每个片段在截取、必要时反向互补之后，按片段自身阅读框翻译出的结果，
   * 用来帮助定位某一段是否出现移码、终止密码子或异常碱基。
   */
  private addFragmentTranslationSection(content: Array<Paragraph | Table>, result: ProcessResult): void {
    const fragmentTranslations = result.fragmentTranslations ?? [];
    if (fragmentTranslations.length === 0) {
      return;
    }

    content.push(
      new Paragraph({
        text: '各片段氨基酸翻译结果:',
        spacing: { after: 80 },
      }),
    );

    for (const fragment of fragmentTranslations) {
      const ruleLabel = fragment.reverseComplement
        ? `#${fragment.order} ${fragment.filePattern}（反向互补）`
        : `#${fragment.order} ${fragment.filePattern}`;

      content.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${ruleLabel} | ${fragment.filename}`,
              bold: true,
              size: 18,
            }),
          ],
          spacing: { before: 80, after: 40 },
        }),
      );

      content.push(
        new Paragraph({
          children: [
            new TextRun({
              text:
                `DNA长度: ${fragment.dnaLength} | 选中阅读框: +${fragment.selectedFrame ?? 0} | ` +
                `三帧评分: ${this.formatReadingFrameScores(fragment.readingFrames)}`,
              size: 16,
              color: '555555',
            }),
          ],
          spacing: { after: 40 },
        }),
      );

      this.addWrappedSequenceParagraphs(content, fragment.proteinSequence || '-', 92);
    }

    content.push(new Paragraph({ text: '' }));
  }

  /**
   * 展示最终蛋白序列。
   *
   * 阅读框选择信息保留在“各片段氨基酸翻译结果”中，正文里的最终蛋白序列保持干净，
   * 避免生成的 Word 文档在用户主要查看结果时显得过于拥挤。
   */
  private addProteinSequenceSection(content: Array<Paragraph | Table>, result: ProcessResult): void {
    this.addWrappedSequenceParagraphs(content, result.proteinSequence || '-', 92);
  }

  /**
   * 将三阅读框的终止前氨基酸长度压缩成一行，便于快速判断哪个阅读框更可信。
   */
  private formatReadingFrameScores(readingFrames: ReadingFrameTranslation[] | undefined): string {
    if (!readingFrames || readingFrames.length === 0) {
      return '-';
    }

    return readingFrames
      .map((frame) => {
        if (frame.alignmentScore === undefined) {
          return `+${frame.frame}:len${frame.proteinLength}`;
        }

        const identity = frame.identityPercent === undefined ? '-' : `${frame.identityPercent.toFixed(0)}%`;
        return `+${frame.frame}:S${frame.alignmentScore}/I${identity}/L${frame.proteinLength}`;
      })
      .join(' / ');
  }

  /**
   * 在真正生成 docx 缓冲区前，先检查目标文件是否可写。
   *
   * Windows 上 Word/WPS 打开中的 docx 通常会拒绝其他进程以读写方式打开；
   * 这里提前探测可以把错误提示前置，避免用户等到文档打包完成后才看到底层 EBUSY/EACCES。
   */
  private assertOutputPathWritable(outputPath: string): void {
    if (!fs.existsSync(outputPath)) {
      return;
    }

    if (fs.statSync(outputPath).isDirectory()) {
      throw new Error(`输出文件当前无法写入，目标路径是目录而不是 .docx 文件: ${outputPath}`);
    }

    let fileHandle: number | undefined;
    try {
      fileHandle = fs.openSync(outputPath, 'r+');
    } catch (error) {
      const message = (error as Error).message;
      throw new Error(`输出文件当前无法写入，可能已被 Word、WPS 或其他程序打开，请关闭后重试: ${outputPath}. ${message}`);
    } finally {
      if (fileHandle !== undefined) {
        fs.closeSync(fileHandle);
      }
    }
  }

  /**
   * 追加单个分组的 BLAST 区块。
   */
  private addBlastSection(content: Array<Paragraph | Table>, blastResult: BlastAlignment): void {
    content.push(
      new Paragraph({
        text: 'BLAST 2 Sequences 对比结果:',
        spacing: { after: 120 },
      }),
    );

    content.push(
      new Paragraph({
        text: '对比统计信息:',
      }),
    );

    content.push(
      new Paragraph({
        text: this.formatStatisticLine(blastResult),
        spacing: { after: 120 },
      }),
    );

    content.push(
      new Paragraph({
        text: 'BLAST 对比序列（表格显示）',
        spacing: { after: 80 },
      }),
    );

    if (blastResult.alignments.length === 0) {
      content.push(
        new Paragraph({
          children: [
            new TextRun({
              text: 'No valid Query / Match / Sbjct alignment block was parsed.',
              color: 'CC3300',
            }),
          ],
        }),
      );
      return;
    }

    content.push(this.createAlignmentTable(blastResult.alignments));
  }

  /**
   * 组装统计信息展示文本。
   */
  private formatStatisticLine(blastResult: BlastAlignment): string {
    if (blastResult.statisticLines && blastResult.statisticLines.length > 0) {
      return blastResult.statisticLines.join(' | ');
    }

    return [
      `Score = ${blastResult.score}`,
      `Identities = ${blastResult.identities}`,
      `Expect = ${blastResult.expect}`,
    ].join(' | ');
  }

  /**
   * 创建 BLAST 对齐表格。
   *
   * 这里采用“一个分组一张表”的方式，
   * 并在多个 alignment 之间插入空白行，尽量贴近旧版 Python 的阅读体验。
   */
  private createAlignmentTable(alignments: AlignmentGroup[]): Table {
    const rows: TableRow[] = [];

    for (let index = 0; index < alignments.length; index++) {
      const alignment = alignments[index];

      if (index > 0) {
        rows.push(this.createTextRow('', '', [new TextRun({ text: '' })], ''));
      }

      rows.push(
        this.createTextRow(
          'Query',
          alignment.query.start.toString(),
          [this.createMonoRun(alignment.query.sequence)],
          alignment.query.end.toString(),
        ),
      );

      rows.push(
        this.createTextRow('Match', '', this.createHighlightedMatchRuns(alignment.match), ''),
      );

      rows.push(
        this.createTextRow(
          'Sbjct',
          alignment.subject.start.toString(),
          [this.createMonoRun(alignment.subject.sequence)],
          alignment.subject.end.toString(),
        ),
      );
    }

    return new Table({
      rows,
      style: 'TableGrid',
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: 'single', size: 4, color: '000000' },
        bottom: { style: 'single', size: 4, color: '000000' },
        left: { style: 'single', size: 4, color: '000000' },
        right: { style: 'single', size: 4, color: '000000' },
        insideHorizontal: { style: 'single', size: 4, color: '000000' },
        insideVertical: { style: 'single', size: 4, color: '000000' },
      },
    });
  }

  /**
   * 创建一行表格。
   */
  private createTextRow(
    label: string,
    start: string,
    sequenceRuns: TextRun[],
    end: string,
  ): TableRow {
    return new TableRow({
      children: [
        this.createCell([new Paragraph({ children: [new TextRun({ text: label, size: 16 })] })], 14),
        this.createCell([new Paragraph({ children: [new TextRun({ text: start, size: 16 })] })], 12),
        this.createCell([new Paragraph({ children: sequenceRuns })], 60),
        this.createCell([new Paragraph({ children: [new TextRun({ text: end, size: 16 })] })], 14),
      ],
    });
  }

  /**
   * 创建表格单元格。
   */
  private createCell(children: Paragraph[], widthPercent: number): TableCell {
    return new TableCell({
      width: { size: widthPercent, type: WidthType.PERCENTAGE },
      children,
    });
  }

  /**
   * 创建等宽字体的序列文本。
   */
  private createMonoRun(text: string): TextRun {
    return new TextRun({
      text,
      size: 16,
      font: 'Consolas',
    });
  }

  /**
   * 将长氨基酸序列按固定字符数换行，并使用等宽字体输出。
   *
   * Word 默认正文字体是比例字体，不同字母宽度不一致，会导致测序/比对序列看起来“对不齐”。
   * 这里统一使用 Consolas，并主动分段，避免 Word 在窄区域中随意折行。
   */
  private addWrappedSequenceParagraphs(
    content: Array<Paragraph | Table>,
    sequence: string,
    lineLength: number,
  ): void {
    const chunks = this.splitSequence(sequence, lineLength);
    for (const chunk of chunks) {
      content.push(
        new Paragraph({
          children: [this.createMonoRun(chunk)],
          spacing: { after: 20 },
        }),
      );
    }
  }

  private splitSequence(sequence: string, lineLength: number): string[] {
    if (!sequence) {
      return ['-'];
    }

    const chunks: string[] = [];
    for (let index = 0; index < sequence.length; index += lineLength) {
      chunks.push(sequence.slice(index, index + lineLength));
    }
    return chunks.length > 0 ? chunks : ['-'];
  }

  /**
   * 旧版 Python 只要 Match 行包含空格或 `+`，就把整行标红。
   */
  private createHighlightedMatchRuns(matchString: string): TextRun[] {
    const hasMutation = matchString.includes(' ') || matchString.includes('+');

    return [
      new TextRun({
        text: matchString.replace(/ /g, '\u00A0'),
        size: 16,
        font: 'Consolas',
        color: hasMutation ? 'FF0000' : undefined,
      }),
    ];
  }
}
