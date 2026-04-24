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
import type { AlignmentGroup, BlastAlignment, DocumentOptions, ProcessResult } from '../../shared/types';

/**
 * Word 文档生成器。
 *
 * 这里专门按旧版 Python 产物的结构来组织文档内容，
 * 这样我们在对照“旧版 Python 输出”和“当前 Electron 输出”时，
 * 可以尽量把差异收敛到真正的业务逻辑，而不是被排版噪音干扰。
 */
export class DocumentGenerator {
  /**
   * 生成最终的 Word 文档。
   *
   * @param options 文档生成参数
   * @returns 最终输出文件路径
   */
  async generateDocument(options: DocumentOptions): Promise<string> {
    const { outputPath, results, blastResults } = options;

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

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

      content.push(
        new Paragraph({
          text: result.proteinSequence,
          spacing: { after: 120 },
        }),
      );

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
    });
  }

  /**
   * 旧版 Python 只要 Match 行包含空格或 `+`，就把整行标红。
   */
  private createHighlightedMatchRuns(matchString: string): TextRun[] {
    const hasMutation = matchString.includes(' ') || matchString.includes('+');

    return [
      new TextRun({
        text: matchString.replace(/ /g, '\u2007'),
        size: 16,
        color: hasMutation ? 'FF0000' : undefined,
      }),
    ];
  }
}
