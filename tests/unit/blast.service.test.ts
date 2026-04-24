import * as fc from 'fast-check';
import { BlastService } from '../../src/main/services/blast.service';

describe('BlastService', () => {
  let blastService: BlastService;

  beforeEach(() => {
    blastService = new BlastService();
  });

  describe('parseBlastResult', () => {
    /**
     * Feature: dna-sequence-merger-desktop, Property 7: BLAST结果解析完整性
     * Validates: Requirements 5.5
     * 
     * 对于任何有效的BLAST API响应，解析后应该提取出所有对齐组，
     * 每个对齐组包含query序列、match字符串和subject序列，以及统计信息（score、identities、expect）。
     */
    it('should parse BLAST HTML response and extract all alignment groups', () => {
      // 示例BLAST HTML响应
      const sampleBlastHtml = `
        <html>
        <body>
        <div>
          Score = 123 bits (456), Expect = 1e-50
          Identities = 100/100 (100%)
        </div>
        <PRE>
Query  1    MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEKAVQVKV  60
            MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEKAVQVKV
Sbjct  1    MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEKAVQVKV  60

Query  61   ELTGKVVDLLAPYRRGGKIGLFGGAGVGKTVLIMELINNVAKAHGGYSVFAGVGERTEG  120
            ELTGKVVDLLAPYRRGGKIGLFGGAGVGKTVLIMELINNVAKAHGGYSVFAGVGERTEG
Sbjct  61   ELTGKVVDLLAPYRRGGKIGLFGGAGVGKTVLIMELINNVAKAHGGYSVFAGVGERTEG  120
        </PRE>
        </body>
        </html>
      `;

      // 使用反射访问私有方法进行测试
      const result = (blastService as any).parseBlastResult(sampleBlastHtml);

      // 验证统计信息被正确提取
      expect(result.score).toContain('123');
      expect(result.identities).toContain('100/100');
      expect(result.expect).toContain('1e-50');

      // 验证对齐组被正确提取
      expect(result.alignments).toHaveLength(2);

      // 验证第一个对齐组
      const firstAlignment = result.alignments[0];
      expect(firstAlignment.query.start).toBe(1);
      expect(firstAlignment.query.end).toBe(60);
      expect(firstAlignment.query.sequence).toBe('MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEKAVQVKV');
      expect(firstAlignment.match).toBe('MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEKAVQVKV');
      expect(firstAlignment.subject.start).toBe(1);
      expect(firstAlignment.subject.end).toBe(60);
      expect(firstAlignment.subject.sequence).toBe('MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEKAVQVKV');

      // 验证第二个对齐组
      const secondAlignment = result.alignments[1];
      expect(secondAlignment.query.start).toBe(61);
      expect(secondAlignment.query.end).toBe(120);
      expect(secondAlignment.query.sequence).toBe('ELTGKVVDLLAPYRRGGKIGLFGGAGVGKTVLIMELINNVAKAHGGYSVFAGVGERTEG');
      expect(secondAlignment.subject.start).toBe(61);
      expect(secondAlignment.subject.end).toBe(120);
      expect(secondAlignment.subject.sequence).toBe('ELTGKVVDLLAPYRRGGKIGLFGGAGVGKTVLIMELINNVAKAHGGYSVFAGVGERTEG');
    });

    it('should handle BLAST response with mismatches', () => {
      const blastHtmlWithMismatches = `
        <html>
        <body>
        <div>
          Score = 95 bits (234), Expect = 2e-20
          Identities = 45/50 (90%)
        </div>
        <PRE>
Query  1    MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLS  50
            MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPIL+RVGDG Q+NLS
Sbjct  1    MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILARVGDGAQENLS  50
        </PRE>
        </body>
        </html>
      `;

      const result = (blastService as any).parseBlastResult(blastHtmlWithMismatches);

      expect(result.score).toContain('95');
      expect(result.identities).toContain('45/50');
      expect(result.expect).toContain('2e-20');
      expect(result.alignments).toHaveLength(1);

      const alignment = result.alignments[0];
      expect(alignment.query.sequence).toBe('MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLS');
      expect(alignment.match).toContain('+');
      expect(alignment.subject.sequence).toBe('MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILARVGDGAQENLS');
    });

    it('should handle BLAST response with gaps', () => {
      const blastHtmlWithGaps = `
        <html>
        <body>
        <div>
          Score = 80 bits (200), Expect = 5e-15
          Identities = 40/50 (80%)
        </div>
        <PRE>
Query  1    MKTAYIAKQRQISFVKSHFSRQLE-RLGLIEVQAPILSRVGDGTQDNLS  50
            MKTAYIAKQRQISFVKSHFSRQLE-RLGLIEVQAPILSRVGDGTQDNLS
Sbjct  1    MKTAYIAKQRQISFVKSHFSRQLE-RLGLIEVQAPILSRVGDGTQDNLS  49
        </PRE>
        </body>
        </html>
      `;

      const result = (blastService as any).parseBlastResult(blastHtmlWithGaps);

      expect(result.alignments).toHaveLength(1);
      const alignment = result.alignments[0];
      expect(alignment.query.sequence).toContain('-');
      expect(alignment.subject.sequence).toContain('-');
    });

    it('should return N/A for missing statistics', () => {
      const blastHtmlNoStats = `
        <html>
        <body>
        <PRE>
Query  1    MKTAYIAK  8
            MKTAYIAK
Sbjct  1    MKTAYIAK  8
        </PRE>
        </body>
        </html>
      `;

      const result = (blastService as any).parseBlastResult(blastHtmlNoStats);

      expect(result.score).toBe('N/A');
      expect(result.identities).toBe('N/A');
      expect(result.expect).toBe('N/A');
      expect(result.alignments).toHaveLength(1);
    });

    it('should return empty alignments for response without PRE tag', () => {
      const blastHtmlNoPre = `
        <html>
        <body>
        <div>
          Score = 123 bits (456), Expect = 1e-50
          Identities = 100/100 (100%)
        </div>
        </body>
        </html>
      `;

      const result = (blastService as any).parseBlastResult(blastHtmlNoPre);

      expect(result.score).toContain('123');
      expect(result.identities).toContain('100/100');
      expect(result.expect).toContain('1e-50');
      expect(result.alignments).toHaveLength(0);
    });

    it('should handle multiple alignment blocks', () => {
      const blastHtmlMultiple = `
        <html>
        <body>
        <div>
          Score = 150 bits (500), Expect = 1e-60
          Identities = 150/150 (100%)
        </div>
        <PRE>
Query  1    MKTAYIAK  8
            MKTAYIAK
Sbjct  1    MKTAYIAK  8

Query  9    QRQISFVK  16
            QRQISFVK
Sbjct  9    QRQISFVK  16

Query  17   SHFSRQLE  24
            SHFSRQLE
Sbjct  17   SHFSRQLE  24
        </PRE>
        </body>
        </html>
      `;

      const result = (blastService as any).parseBlastResult(blastHtmlMultiple);

      expect(result.alignments).toHaveLength(3);
      expect(result.alignments[0].query.start).toBe(1);
      expect(result.alignments[1].query.start).toBe(9);
      expect(result.alignments[2].query.start).toBe(17);
    });

    it('should handle case-insensitive Query and Sbjct tags', () => {
      const blastHtmlCaseInsensitive = `
        <html>
        <body>
        <PRE>
query  1    MKTAYIAK  8
            MKTAYIAK
sbjct  1    MKTAYIAK  8
        </PRE>
        </body>
        </html>
      `;

      const result = (blastService as any).parseBlastResult(blastHtmlCaseInsensitive);

      expect(result.alignments).toHaveLength(1);
      expect(result.alignments[0].query.sequence).toBe('MKTAYIAK');
      expect(result.alignments[0].subject.sequence).toBe('MKTAYIAK');
    });
  });

  describe('extractStatistic', () => {
    it('should extract Score statistic', () => {
      const html = 'Score = 123 bits (456), Expect = 1e-50';
      const score = (blastService as any).extractStatistic(html, 'Score');
      expect(score).toContain('123');
    });

    it('should extract Identities statistic', () => {
      const html = 'Identities = 100/100 (100%), Positives = 100/100 (100%)';
      const identities = (blastService as any).extractStatistic(html, 'Identities');
      expect(identities).toContain('100/100');
    });

    it('should extract Expect statistic', () => {
      const html = 'Score = 123 bits (456), Expect = 1e-50';
      const expectValue = (blastService as any).extractStatistic(html, 'Expect');
      expect(expectValue).toBe('1e-50');
    });

    it('should return null for missing statistic', () => {
      const html = 'Score = 123 bits (456)';
      const identities = (blastService as any).extractStatistic(html, 'Identities');
      expect(identities).toBeNull();
    });

    it('should return null for unknown statistic name', () => {
      const html = 'Score = 123 bits (456)';
      const unknown = (blastService as any).extractStatistic(html, 'Unknown');
      expect(unknown).toBeNull();
    });
  });
});
