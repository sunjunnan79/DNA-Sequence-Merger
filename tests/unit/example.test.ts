// 示例测试文件 - 验证测试环境配置

import * as fc from 'fast-check';
import { createTestMergeRule, generateRandomDNA } from '../utils/test-helpers';
import { dnaSequenceArbitrary, mergeRuleArbitrary } from '../utils/arbitraries';
import { sampleMergeRule, CODON_TABLE } from '../fixtures/sample-data';

describe('Test Environment Setup', () => {
  describe('Unit Tests', () => {
    it('should run basic unit tests', () => {
      expect(true).toBe(true);
    });

    it('should use test helpers', () => {
      const rule = createTestMergeRule();
      expect(rule).toBeDefined();
      expect(rule.name).toBe('Test Rule');
      expect(rule.fragments).toHaveLength(2);
    });

    it('should use test fixtures', () => {
      expect(sampleMergeRule).toBeDefined();
      expect(sampleMergeRule.name).toBe('Standard Merge Rule');
      expect(sampleMergeRule.fragments).toHaveLength(3);
    });

    it('should generate random DNA sequences', () => {
      const dna = generateRandomDNA(30);
      expect(dna).toHaveLength(30);
      expect(dna).toMatch(/^[ATGC]+$/);
    });

    it('should have codon table', () => {
      expect(CODON_TABLE['ATG']).toBe('M');
      expect(CODON_TABLE['TAA']).toBe('_');
    });
  });

  describe('Property-Based Tests', () => {
    it('should run property-based tests with fast-check', () => {
      fc.assert(
        fc.property(fc.integer(), (n) => {
          return n + 0 === n;
        }),
        { numRuns: 100 }
      );
    });

    it('should use DNA sequence arbitrary', () => {
      fc.assert(
        fc.property(dnaSequenceArbitrary(10, 50), (dna) => {
          expect(dna.length).toBeGreaterThanOrEqual(10);
          expect(dna.length).toBeLessThanOrEqual(50);
          expect(dna).toMatch(/^[ATGC]+$/);
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should use merge rule arbitrary', () => {
      fc.assert(
        fc.property(mergeRuleArbitrary(), (rule) => {
          expect(rule.name).toBeDefined();
          expect(rule.name.length).toBeGreaterThan(0);
          expect(rule.fragments.length).toBeGreaterThan(0);
          
          // Check fragment order is sequential
          rule.fragments.forEach((fragment, index) => {
            expect(fragment.order).toBe(index + 1);
          });
          
          return true;
        }),
        { numRuns: 100 }
      );
    });
  });
});
