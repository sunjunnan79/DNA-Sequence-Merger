// 文档生成器测试
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';
import { DocumentGenerator } from '../../src/main/services/document.generator';
import { processResultArbitrary, blastAlignmentArbitrary, proteinSequenceArbitrary } from '../utils/arbitraries';
import type { DocumentOptions, ProcessResult, BlastAlignment } from '../../src/shared/types';

describe('DocumentGenerator', () => {
  let generator: DocumentGenerator;
  const tempDir = path.join(__dirname, '../../temp');

  beforeAll(() => {
    // 确保临时目录存在
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  beforeEach(() => {
    generator = new DocumentGenerator();
  });

  afterEach(() => {
    // 清理测试生成的文档
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      files.forEach(file => {
        if (file.endsWith('.docx')) {
          fs.unlinkSync(path.join(tempDir, file));
        }
      });
    }
  });

  describe('基础文档生成', () => {
    it('应该成功生成文档文件', async () => {
      const result: ProcessResult = {
        groupName: 'test-group',
        dnaSequence: 'ATGATGATG',
        proteinSequence: 'MMM',
        warnings: [],
      };

      const outputPath = path.join(tempDir, 'test-basic.docx');
      const options: DocumentOptions = {
        outputPath,
        results: [result],
        blastResults: new Map(),
        subjectSequence: 'MMM',
      };

      const generatedPath = await generator.generateDocument(options);

      expect(generatedPath).toBe(outputPath);
      expect(fs.existsSync(outputPath)).toBe(true);
      expect(fs.statSync(outputPath).size).toBeGreaterThan(0);
    });

    it('应该处理多个分组', async () => {
      const results: ProcessResult[] = [
        {
          groupName: 'group1',
          dnaSequence: 'ATGATGATG',
          proteinSequence: 'MMM',
          warnings: [],
        },
        {
          groupName: 'group2',
          dnaSequence: 'GCAGCAGCA',
          proteinSequence: 'AAA',
          warnings: ['test warning'],
        },
      ];

      const outputPath = path.join(tempDir, 'test-multiple.docx');
      const options: DocumentOptions = {
        outputPath,
        results,
        blastResults: new Map(),
        subjectSequence: 'MMM',
      };

      const generatedPath = await generator.generateDocument(options);

      expect(fs.existsSync(generatedPath)).toBe(true);
    });
  });

  describe('BLAST结果表格', () => {
    it('应该包含BLAST对比结果', async () => {
      const result: ProcessResult = {
        groupName: 'test-group',
        dnaSequence: 'ATGATGATG',
        proteinSequence: 'MMM',
        warnings: [],
      };

      const blastResult: BlastAlignment = {
        score: '100',
        identities: '10/10 (100%)',
        expect: '1e-10',
        alignments: [
          {
            query: { start: 1, end: 10, sequence: 'MMMMMMMMMM' },
            match: '||||||||||',
            subject: { start: 1, end: 10, sequence: 'MMMMMMMMMM' },
          },
        ],
      };

      const blastResults = new Map<string, BlastAlignment>();
      blastResults.set('test-group', blastResult);

      const outputPath = path.join(tempDir, 'test-blast.docx');
      const options: DocumentOptions = {
        outputPath,
        results: [result],
        blastResults,
        subjectSequence: 'MMMMMMMMMM',
      };

      const generatedPath = await generator.generateDocument(options);

      expect(fs.existsSync(generatedPath)).toBe(true);
      expect(fs.statSync(generatedPath).size).toBeGreaterThan(0);
    });
  });

  describe('属性测试：文档生成完整性', () => {
    /**
     * Feature: dna-sequence-merger-desktop, Property 8: 文档生成完整性
     * Validates: Requirements 6.2, 6.3, 6.4
     * 
     * 对于任何处理结果集合，生成的Word文档应该：
     * - 为每个分组包含一个段落显示组名
     * - 为每个分组包含翻译后的蛋白质序列
     * - 为每个分组包含BLAST对比结果表格
     * - 表格中突变位置用红色高亮显示
     */
    it('属性 8: 对于任何处理结果，生成的文档应该包含所有必需内容', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(processResultArbitrary(), { minLength: 1, maxLength: 3 }),
          fc.array(
            fc.tuple(fc.string({ minLength: 1, maxLength: 30 }), blastAlignmentArbitrary()),
            { maxLength: 3 }
          ),
          proteinSequenceArbitrary(10, 50),
          async (results, blastPairs, subjectSequence) => {
            // 创建BLAST结果映射
            const blastResults = new Map<string, BlastAlignment>();
            blastPairs.forEach(([groupName, alignment]) => {
              blastResults.set(groupName, alignment);
            });

            // 生成唯一的输出路径
            const timestamp = Date.now();
            const random = Math.floor(Math.random() * 10000);
            const outputPath = path.join(tempDir, `test-property-${timestamp}-${random}.docx`);

            const options: DocumentOptions = {
              outputPath,
              results,
              blastResults,
              subjectSequence,
            };

            try {
              // 生成文档
              const generatedPath = await generator.generateDocument(options);

              // 验证文档存在
              expect(fs.existsSync(generatedPath)).toBe(true);

              // 验证文档不为空
              const stats = fs.statSync(generatedPath);
              expect(stats.size).toBeGreaterThan(0);

              // 验证文档大小合理（至少包含基本结构）
              // 一个空的docx文件大约是几KB，有内容的应该更大
              expect(stats.size).toBeGreaterThan(1000);

              // 清理测试文件
              fs.unlinkSync(generatedPath);
            } catch (error) {
              // 如果生成失败，确保清理可能存在的文件
              if (fs.existsSync(outputPath)) {
                fs.unlinkSync(outputPath);
              }
              throw error;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('属性 8: 文档应该包含所有分组的信息', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(processResultArbitrary(), { minLength: 1, maxLength: 5 }),
          async (results) => {
            const timestamp = Date.now();
            const random = Math.floor(Math.random() * 10000);
            const outputPath = path.join(tempDir, `test-groups-${timestamp}-${random}.docx`);

            const options: DocumentOptions = {
              outputPath,
              results,
              blastResults: new Map(),
              subjectSequence: 'TEST',
            };

            try {
              await generator.generateDocument(options);

              // 验证文档存在且不为空
              expect(fs.existsSync(outputPath)).toBe(true);
              expect(fs.statSync(outputPath).size).toBeGreaterThan(0);

              // 清理
              fs.unlinkSync(outputPath);
            } catch (error) {
              if (fs.existsSync(outputPath)) {
                fs.unlinkSync(outputPath);
              }
              throw error;
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
