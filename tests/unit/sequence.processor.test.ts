import * as fc from 'fast-check';
import { SequenceProcessor } from '../../src/main/services/sequence.processor';
import { FileService } from '../../src/main/services/file.service';
import { ExpasyTranslationService } from '../../src/main/services/translation.service';
import { dnaCodonSequenceArbitrary } from '../utils/arbitraries';

describe('SequenceProcessor', () => {
  let processor: SequenceProcessor;
  let fileService: FileService;

  beforeEach(() => {
    fileService = new FileService();
    processor = new SequenceProcessor(fileService);
  });

  describe('translateToProtein', () => {
    /**
     * Feature: dna-sequence-merger-desktop, Property 6: DNA翻译正确性
     * Validates: Requirements 4.5
     * 
     * 对于任何有效的DNA序列（长度为3的倍数），翻译成蛋白质序列后：
     * - 每3个碱基对应一个氨基酸
     * - 每个密码子根据遗传密码表正确翻译
     * - 遇到终止密码子（TAA, TAG, TGA）时停止翻译
     */
    it('should correctly translate DNA sequences to protein sequences', () => {
      fc.assert(
        fc.property(
          dnaCodonSequenceArbitrary(1, 100),
          (dna) => {
            const protein = processor.translateToProtein(dna);
            
            // 验证长度关系：蛋白质长度应该小于等于DNA长度除以3
            expect(protein.length).toBeLessThanOrEqual(dna.length / 3);
            
            // 验证每个氨基酸都是有效的（标准氨基酸或X表示未知）
            expect(protein).toMatch(/^[ACDEFGHIKLMNPQRSTVWY_X]*$/);
            
            // 如果蛋白质序列包含终止符号_，它应该是最后一个字符
            const stopIndex = protein.indexOf('_');
            if (stopIndex !== -1) {
              expect(stopIndex).toBe(protein.length - 1);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle stop codons correctly', () => {
      // TAA, TAG, TGA 是终止密码子
      expect(processor.translateToProtein('ATGTAA')).toBe('M');
      expect(processor.translateToProtein('ATGTAG')).toBe('M');
      expect(processor.translateToProtein('ATGTGA')).toBe('M');
      
      // 终止密码子后的序列不应该被翻译
      expect(processor.translateToProtein('ATGTAAATG')).toBe('M');
    });

    it('should translate known codons correctly', () => {
      // 测试一些已知的密码子
      expect(processor.translateToProtein('ATG')).toBe('M'); // 起始密码子
      expect(processor.translateToProtein('ATGATC')).toBe('MI');
      expect(processor.translateToProtein('ATGATCGCA')).toBe('MIA');
    });

    it('should handle invalid codons as X', () => {
      // 包含非ATGC字符的密码子应该翻译为X
      expect(processor.translateToProtein('ATGNNN')).toBe('MX');
      expect(processor.translateToProtein('XXXATG')).toBe('XM');
    });

    it('should ignore incomplete codons at the end', () => {
      // 长度不是3的倍数时，末尾不完整的密码子应该被忽略
      expect(processor.translateToProtein('ATGA')).toBe('M');
      expect(processor.translateToProtein('ATGAT')).toBe('M');
      expect(processor.translateToProtein('ATGATC')).toBe('MI');
    });

    it('should handle empty sequences', () => {
      expect(processor.translateToProtein('')).toBe('');
    });

    it('should handle sequences shorter than 3 bases', () => {
      expect(processor.translateToProtein('A')).toBe('');
      expect(processor.translateToProtein('AT')).toBe('');
    });

    it('should be case-insensitive', () => {
      expect(processor.translateToProtein('atg')).toBe('M');
      expect(processor.translateToProtein('AtG')).toBe('M');
      expect(processor.translateToProtein('aTg')).toBe('M');
    });

    it('should choose reading frame by local alignment to reference protein when available', async () => {
      // 第 0 阅读框会得到 NGIL，但第 +1 阅读框能翻译出和参考蛋白完全一致的 MAF。
      // 这里验证阅读框选择交给 Smith-Waterman 局部比对，而不是只看终止前长度。
      const result = await processor.translateBestReadingFrame('AATGGCATTTTAA', 'MAF');

      expect(result.selectedFrame).toBe(1);
      expect(result.proteinSequence).toBe('MAF');
      expect(result.selectionMethod).toBe('reference-alignment');
      expect(result.alignmentScore).toBeGreaterThan(0);
    });
  });

  describe('Expasy Translate parsing', () => {
    it('should parse six-frame FASTA returned by Expasy Translate', () => {
      const service = new ExpasyTranslationService();
      const frames = service.parseFastaFrames(
        [
          "> VIRT-2119284:3'5' Frame 1",
          'LKCH',
          "> VIRT-2119284:3'5' Frame 2",
          '-NAI',
          "> VIRT-2119284:3'5' Frame 3",
          'KMP',
          "> VIRT-2119284:5'3' Frame 1",
          'NGIL',
          "> VIRT-2119284:5'3' Frame 2",
          'MAF-',
          "> VIRT-2119284:5'3' Frame 3",
          'WHF',
        ].join('\n'),
      );

      expect(frames).toEqual([
        { strand: 'reverse', frame: 0, proteinSequence: 'LKCH' },
        { strand: 'reverse', frame: 1, proteinSequence: '-NAI' },
        { strand: 'reverse', frame: 2, proteinSequence: 'KMP' },
        { strand: 'forward', frame: 0, proteinSequence: 'NGIL' },
        { strand: 'forward', frame: 1, proteinSequence: 'MAF-' },
        { strand: 'forward', frame: 2, proteinSequence: 'WHF' },
      ]);
    });
  });

  describe('reverseComplement', () => {
    it('should create reverse complement DNA sequences', () => {
      // 反向互补需要先反转序列方向，再逐位替换为互补碱基。
      expect(processor.reverseComplement('ATGC')).toBe('GCAT');
      expect(processor.reverseComplement('atgcnn')).toBe('NNGCAT');
      expect(processor.reverseComplement('ARYN')).toBe('NRYT');
    });
  });

  describe('extractFragment', () => {
    /**
     * Feature: dna-sequence-merger-desktop, Property 4: 序列截取正确性
     * Validates: Requirements 4.3
     * 
     * 对于任何DNA序列和标记序列配置（起始标记、结束标记、是否包含标记），截取后的序列应该：
     * - 如果配置了起始标记且找到，序列应该从标记位置开始（包含或不包含标记取决于配置）
     * - 如果配置了结束标记且找到，序列应该在标记位置结束（包含或不包含标记取决于配置）
     * - 如果标记未找到，应该返回原序列或空序列（取决于配置）
     */
    it('should correctly extract fragments based on start and end patterns', () => {
      fc.assert(
        fc.property(
          dnaCodonSequenceArbitrary(10, 50),
          fc.constantFrom('ATG', 'GCA', 'TAA', 'CCC'),
          fc.constantFrom('TAG', 'TGA', 'AAA', 'GGG'),
          fc.boolean(),
          fc.boolean(),
          (sequence, startPattern, endPattern, includeStart, includeEnd) => {
            // 确保标记存在于序列中且不重叠，并且中间有内容
            // 使用一个不会出现在模式中的分隔符
            const separator = 'NNNNNN';
            const testSequence = startPattern + separator + sequence + separator + endPattern;
            const fragment = processor.extractFragment(
              testSequence,
              startPattern,
              endPattern,
              includeStart,
              includeEnd
            );

            // 验证片段不为空（因为标记存在且中间有内容）
            expect(fragment.length).toBeGreaterThan(0);

            // 验证起始标记的包含/不包含
            if (includeStart) {
              // 如果包含起始标记，片段应该以起始标记开头
              expect(fragment.startsWith(startPattern)).toBe(true);
            }

            // 验证结束标记的包含/不包含
            if (includeEnd) {
              // 如果包含结束标记，片段应该以结束标记结尾
              expect(fragment.endsWith(endPattern)).toBe(true);
            }
            
            // 验证片段是原序列的子串
            expect(testSequence.includes(fragment)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return empty string when start pattern is not found', () => {
      const sequence = 'ATGATCGCATAG';
      const result = processor.extractFragment(sequence, 'ZZZZZ', undefined, false, false);
      expect(result).toBe('');
    });

    it('should extract from start pattern to end when no end pattern specified', () => {
      const sequence = 'AAAAAATGCCCCC';
      const result = processor.extractFragment(sequence, 'ATG', undefined, false, false);
      expect(result).toBe('CCCCC');
    });

    it('should extract from beginning to end pattern when no start pattern specified', () => {
      const sequence = 'AAAAAATGCCCCC';
      const result = processor.extractFragment(sequence, undefined, 'ATG', false, false);
      expect(result).toBe('AAAAA'); // Should stop before 'ATG'
    });

    it('should include start pattern when includeStart is true', () => {
      const sequence = 'AAAAAATGCCCCC';
      const result = processor.extractFragment(sequence, 'ATG', undefined, true, false);
      expect(result).toBe('ATGCCCCC');
    });

    it('should include end pattern when includeEnd is true', () => {
      const sequence = 'AAAAAATGCCCCC';
      const result = processor.extractFragment(sequence, undefined, 'ATG', false, true);
      expect(result).toBe('AAAAAATG');
    });

    it('should extract middle section with both patterns', () => {
      const sequence = 'AAAAAATGCCCCCTAGGGGGG';
      const result = processor.extractFragment(sequence, 'ATG', 'TAG', false, false);
      expect(result).toBe('CCCCC');
    });

    it('should include both patterns when both include flags are true', () => {
      const sequence = 'AAAAAATGCCCCCTAGGGGGG';
      const result = processor.extractFragment(sequence, 'ATG', 'TAG', true, true);
      expect(result).toBe('ATGCCCCCTAG');
    });

    it('should return entire sequence when no patterns specified', () => {
      const sequence = 'ATGATCGCATAG';
      const result = processor.extractFragment(sequence, undefined, undefined, false, false);
      expect(result).toBe(sequence);
    });

    it('should handle case when start pattern comes after end pattern in sequence', () => {
      const sequence = 'ATGTAGCCC';
      // ATG comes before TAG, so this should work normally
      const result = processor.extractFragment(sequence, 'ATG', 'TAG', false, false);
      expect(result).toBe(''); // Empty because there's nothing between ATG and TAG
    });

    it('should handle end pattern not found by using sequence end', () => {
      const sequence = 'AAAAAATGCCCCC';
      const result = processor.extractFragment(sequence, 'ATG', 'ZZZZZ', false, false);
      expect(result).toBe('CCCCC');
    });
  });

  describe('mergeSequences', () => {
    /**
     * Feature: dna-sequence-merger-desktop, Property 5: 序列拼接顺序性
     * Validates: Requirements 4.1, 4.2
     * 
     * 对于任何一组序列文件和拼接规则，拼接后的DNA序列应该按照规则中定义的顺序连接各个片段，
     * 且每个片段都经过了正确的截取处理。
     */
    it('should merge sequences in the correct order according to the rule', async () => {
      // 创建临时测试文件
      const fs = require('fs');
      const path = require('path');
      const tmpDir = path.join(process.cwd(), 'temp', `test_${Date.now()}`);
      
      try {
        await fs.promises.mkdir(tmpDir, { recursive: true });

        // 创建测试序列文件
        const file1Path = path.join(tmpDir, 'pattern1(group1).seq');
        const file2Path = path.join(tmpDir, 'pattern2(group1).seq');
        const file3Path = path.join(tmpDir, 'pattern3(group1).seq');

        await fs.promises.writeFile(file1Path, 'ATGAAACCCGGG');
        await fs.promises.writeFile(file2Path, 'TTTGCATAG');
        await fs.promises.writeFile(file3Path, 'CCCAAATTT');

        // 创建测试规则
        const rule: Omit<import('../../src/shared/types').MergeRule, 'id' | 'createdAt' | 'updatedAt'> = {
          name: 'Test Rule',
          fragments: [
            {
              order: 1,
              filePattern: 'pattern1',
              startSequence: 'ATG',
              endSequence: undefined,
              includeStart: true,
              includeEnd: false,
            },
            {
              order: 2,
              filePattern: 'pattern2',
              startSequence: undefined,
              endSequence: 'TAG',
              includeStart: false,
              includeEnd: false,
            },
            {
              order: 3,
              filePattern: 'pattern3',
              startSequence: undefined,
              endSequence: undefined,
              includeStart: false,
              includeEnd: false,
            },
          ],
        };

        // 创建测试文件列表
        const files: import('../../src/shared/types').SequenceFile[] = [
          {
            path: file1Path,
            filename: 'pattern1(group1).seq',
            group: '(group1)',
            pattern: 'pattern1',
            size: 100,
          },
          {
            path: file2Path,
            filename: 'pattern2(group1).seq',
            group: '(group1)',
            pattern: 'pattern2',
            size: 100,
          },
          {
            path: file3Path,
            filename: 'pattern3(group1).seq',
            group: '(group1)',
            pattern: 'pattern3',
            size: 100,
          },
        ];

        // 执行拼接
        const result = await processor.mergeSequences({
          rule: rule as import('../../src/shared/types').MergeRule,
          files,
        });

        // 验证结果
        expect(result.groupName).toBe('(group1)');
        expect(result.warnings).toHaveLength(0);
        expect(result.fragmentTranslations).toEqual([
          expect.objectContaining({
            order: 1,
            filePattern: 'pattern1',
            filename: 'pattern1(group1).seq',
            dnaLength: 12,
            proteinSequence: 'MKPG',
            selectedFrame: 0,
            reverseComplement: false,
          }),
          expect.objectContaining({
            order: 2,
            filePattern: 'pattern2',
            filename: 'pattern2(group1).seq',
            dnaLength: 6,
            proteinSequence: 'FA',
            selectedFrame: 0,
            reverseComplement: false,
          }),
          expect.objectContaining({
            order: 3,
            filePattern: 'pattern3',
            filename: 'pattern3(group1).seq',
            dnaLength: 9,
            proteinSequence: 'PKF',
            selectedFrame: 0,
            reverseComplement: false,
          }),
        ]);
        expect(result.fragmentTranslations?.[0].readingFrames.map((frame) => frame.proteinLength)).toEqual([4, 0, 3]);
        
        // 验证DNA序列按顺序拼接
        // pattern1: ATGAAACCCGGG -> 从ATG开始 -> ATGAAACCCGGG
        // pattern2: TTTGCATAG -> 到TAG结束（不包含） -> TTTGCA
        // pattern3: CCCAAATTT -> 全部 -> CCCAAATTT
        expect(result.dnaSequence).toBe('ATGAAACCCGGGTTTGCACCCAAATTT');
        
        // 验证蛋白质序列已翻译
        expect(result.proteinSequence.length).toBeGreaterThan(0);
      } finally {
        // 清理临时文件
        try {
          await fs.promises.rm(tmpDir, { recursive: true, force: true });
        } catch (e) {
          // 忽略清理错误
        }
      }
    });

    it('should handle missing files with warnings', async () => {
      const rule: Omit<import('../../src/shared/types').MergeRule, 'id' | 'createdAt' | 'updatedAt'> = {
        name: 'Test Rule',
        fragments: [
          {
            order: 1,
            filePattern: 'missing-pattern',
            startSequence: undefined,
            endSequence: undefined,
            includeStart: false,
            includeEnd: false,
          },
        ],
      };

      const files: import('../../src/shared/types').SequenceFile[] = [];

      const result = await processor.mergeSequences({
        rule: rule as import('../../src/shared/types').MergeRule,
        files,
      });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Missing file');
      expect(result.dnaSequence).toBe('');
    });

    it('should handle marker not found with warnings', async () => {
      const fs = require('fs');
      const path = require('path');
      const tmpDir = path.join(process.cwd(), 'temp', `test_${Date.now()}`);
      
      try {
        await fs.promises.mkdir(tmpDir, { recursive: true });

        const filePath = path.join(tmpDir, 'test(group1).seq');
        await fs.promises.writeFile(filePath, 'ATGATCGCA');

        const rule: Omit<import('../../src/shared/types').MergeRule, 'id' | 'createdAt' | 'updatedAt'> = {
          name: 'Test Rule',
          fragments: [
            {
              order: 1,
              filePattern: 'test',
              startSequence: 'ZZZZZ', // 不存在的标记
              endSequence: undefined,
              includeStart: false,
              includeEnd: false,
            },
          ],
        };

        const files: import('../../src/shared/types').SequenceFile[] = [
          {
            path: filePath,
            filename: 'test(group1).seq',
            group: '(group1)',
            pattern: 'test',
            size: 100,
          },
        ];

        const result = await processor.mergeSequences({
          rule: rule as import('../../src/shared/types').MergeRule,
          files,
        });

        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings[0]).toContain('Failed to extract fragment');
      } finally {
        try {
          await fs.promises.rm(tmpDir, { recursive: true, force: true });
        } catch (e) {
          // 忽略清理错误
        }
      }
    });

    it('should respect fragment order', async () => {
      const fs = require('fs');
      const path = require('path');
      const tmpDir = path.join(process.cwd(), 'temp', `test_${Date.now()}`);
      
      try {
        await fs.promises.mkdir(tmpDir, { recursive: true });

        const file1Path = path.join(tmpDir, 'A(group1).seq');
        const file2Path = path.join(tmpDir, 'B(group1).seq');
        const file3Path = path.join(tmpDir, 'C(group1).seq');

        await fs.promises.writeFile(file1Path, 'AAA');
        await fs.promises.writeFile(file2Path, 'BBB');
        await fs.promises.writeFile(file3Path, 'CCC');

        const rule: Omit<import('../../src/shared/types').MergeRule, 'id' | 'createdAt' | 'updatedAt'> = {
          name: 'Test Rule',
          fragments: [
            { order: 3, filePattern: 'C', startSequence: undefined, endSequence: undefined, includeStart: false, includeEnd: false },
            { order: 1, filePattern: 'A', startSequence: undefined, endSequence: undefined, includeStart: false, includeEnd: false },
            { order: 2, filePattern: 'B', startSequence: undefined, endSequence: undefined, includeStart: false, includeEnd: false },
          ],
        };

        const files: import('../../src/shared/types').SequenceFile[] = [
          { path: file1Path, filename: 'A(group1).seq', group: '(group1)', pattern: 'A', size: 3 },
          { path: file2Path, filename: 'B(group1).seq', group: '(group1)', pattern: 'B', size: 3 },
          { path: file3Path, filename: 'C(group1).seq', group: '(group1)', pattern: 'C', size: 3 },
        ];

        const result = await processor.mergeSequences({
          rule: rule as import('../../src/shared/types').MergeRule,
          files,
        });

        // 应该按照order排序：A(1) -> B(2) -> C(3)
        expect(result.dnaSequence).toBe('AAABBBCCC');
      } finally {
        try {
          await fs.promises.rm(tmpDir, { recursive: true, force: true });
        } catch (e) {
          // 忽略清理错误
        }
      }
    });

    it('should apply reverse complement after extracting each matched fragment when enabled', async () => {
      const fs = require('fs');
      const path = require('path');
      const tmpDir = path.join(process.cwd(), 'temp', `test_${Date.now()}`);

      try {
        await fs.promises.mkdir(tmpDir, { recursive: true });

        const file1Path = path.join(tmpDir, 'A(group1).seq');
        const file2Path = path.join(tmpDir, 'B(group1).seq');

        // 先在原始序列中按 AAA/TTT 截出 GGGATG，再对截出的片段做反向互补得到 CATCCC。
        await fs.promises.writeFile(file1Path, 'CCCAAAGGGATGTTTCCC');
        // 第二个片段同理：原始截出 ATGAAA，反向互补后得到 TTTCAT。
        await fs.promises.writeFile(file2Path, 'GGGCCCATGAAATTTGGG');

        const rule: Omit<import('../../src/shared/types').MergeRule, 'id' | 'createdAt' | 'updatedAt'> = {
          name: 'Reverse Complement Rule',
          fragments: [
            {
              order: 1,
              filePattern: 'A',
              startSequence: 'AAA',
              endSequence: 'TTT',
              includeStart: false,
              includeEnd: false,
              reverseComplement: true,
            },
            {
              order: 2,
              filePattern: 'B',
              startSequence: 'ATG',
              endSequence: 'TTT',
              includeStart: true,
              includeEnd: false,
              reverseComplement: true,
            },
          ],
        };

        const files: import('../../src/shared/types').SequenceFile[] = [
          { path: file1Path, filename: 'A(group1).seq', group: '(group1)', pattern: 'A', size: 12 },
          { path: file2Path, filename: 'B(group1).seq', group: '(group1)', pattern: 'B', size: 9 },
        ];

        const result = await processor.mergeSequences({
          rule: rule as import('../../src/shared/types').MergeRule,
          files,
        });

        // 反向互补应分别发生在 A、B 两个片段截取后，最后按规则顺序拼接转换后的片段。
        expect(result.dnaSequence).toBe('CATCCCTTTCAT');
        expect(result.proteinSequence).toBe('HPFH');
      } finally {
        try {
          await fs.promises.rm(tmpDir, { recursive: true, force: true });
        } catch (e) {
          // 忽略清理错误
        }
      }
    });
  });
});
