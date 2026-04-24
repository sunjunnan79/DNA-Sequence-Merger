// fast-check arbitraries for property-based testing

import * as fc from 'fast-check';
import type { MergeRule, FragmentRule, SequenceFile, FileGroup, ProcessResult, BlastAlignment, AlignmentGroup } from '../../src/shared/types';

/**
 * Arbitrary for DNA sequences
 */
export const dnaSequenceArbitrary = (minLength: number = 3, maxLength: number = 300): fc.Arbitrary<string> => {
  return fc.array(fc.constantFrom('A', 'T', 'G', 'C'), { minLength, maxLength })
    .map(arr => arr.join(''));
};

/**
 * Arbitrary for DNA sequences with length divisible by 3 (for translation)
 */
export const dnaCodonSequenceArbitrary = (minCodons: number = 1, maxCodons: number = 100): fc.Arbitrary<string> => {
  return fc.array(fc.constantFrom('A', 'T', 'G', 'C'), { 
    minLength: minCodons * 3, 
    maxLength: maxCodons * 3 
  }).map(arr => {
    const length = Math.floor(arr.length / 3) * 3;
    return arr.slice(0, length).join('');
  });
};

/**
 * Arbitrary for protein sequences
 */
export const proteinSequenceArbitrary = (minLength: number = 1, maxLength: number = 100): fc.Arbitrary<string> => {
  const aminoAcids = 'ACDEFGHIKLMNPQRSTVWY_X';
  return fc.array(fc.constantFrom(...aminoAcids.split('')), { minLength, maxLength })
    .map(arr => arr.join(''));
};

/**
 * Arbitrary for FragmentRule
 */
export const fragmentRuleArbitrary = (): fc.Arbitrary<FragmentRule> => {
  return fc.record({
    order: fc.integer({ min: 1, max: 10 }),
    filePattern: fc.constantFrom('pETUpstream', 'HpaB554', 'DuetDOWN1', 'test-pattern'),
    startSequence: fc.option(dnaSequenceArbitrary(3, 20), { nil: undefined }),
    endSequence: fc.option(dnaSequenceArbitrary(3, 20), { nil: undefined }),
    includeStart: fc.boolean(),
    includeEnd: fc.boolean(),
  });
};

/**
 * Arbitrary for MergeRule
 */
export const mergeRuleArbitrary = (): fc.Arbitrary<Omit<MergeRule, 'id' | 'createdAt' | 'updatedAt'>> => {
  return fc.record({
    name: fc.string({ minLength: 1, maxLength: 50 }),
    description: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
    fragments: fc.array(fragmentRuleArbitrary(), { minLength: 1, maxLength: 5 })
      .map(fragments => fragments.map((f, i) => ({ ...f, order: i + 1 }))),
  });
};

/**
 * Arbitrary for SequenceFile
 */
export const sequenceFileArbitrary = (): fc.Arbitrary<SequenceFile> => {
  return fc.record({
    path: fc.string({ minLength: 5, maxLength: 100 }),
    filename: fc.string({ minLength: 5, maxLength: 50 }),
    group: fc.string({ minLength: 1, maxLength: 20 }),
    pattern: fc.constantFrom('pETUpstream', 'HpaB554', 'DuetDOWN1'),
    size: fc.integer({ min: 100, max: 100000 }),
  });
};

/**
 * Arbitrary for FileGroup
 */
export const fileGroupArbitrary = (): fc.Arbitrary<FileGroup> => {
  return fc.record({
    groupName: fc.string({ minLength: 1, maxLength: 20 }),
    files: fc.array(sequenceFileArbitrary(), { minLength: 1, maxLength: 5 }),
    isComplete: fc.boolean(),
    missingPatterns: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 3 }),
  });
};

/**
 * Arbitrary for file paths
 */
export const filePathArbitrary = (): fc.Arbitrary<string> => {
  return fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 })
    .map(parts => '/' + parts.join('/'));
};

/**
 * Arbitrary for configuration key-value pairs
 */
export const configPairArbitrary = (): fc.Arbitrary<{ key: string; value: any }> => {
  return fc.record({
    key: fc.string({ minLength: 1, maxLength: 50 }),
    value: fc.oneof(
      fc.string(),
      fc.integer(),
      fc.boolean(),
      fc.double().filter(n => Number.isFinite(n)), // Filter out Infinity, -Infinity, and NaN
      fc.array(fc.string()),
      fc.dictionary(fc.string(), fc.string())
    ),
  });
};

/**
 * Arbitrary for ProcessResult
 */
export const processResultArbitrary = (): fc.Arbitrary<ProcessResult> => {
  return fc.record({
    groupName: fc.string({ minLength: 1, maxLength: 30 }),
    dnaSequence: dnaCodonSequenceArbitrary(10, 50),
    proteinSequence: proteinSequenceArbitrary(10, 50),
    warnings: fc.array(fc.string({ minLength: 5, maxLength: 100 }), { maxLength: 5 }),
  });
};

/**
 * Arbitrary for AlignmentGroup
 */
export const alignmentGroupArbitrary = (): fc.Arbitrary<AlignmentGroup> => {
  return fc.record({
    query: fc.record({
      start: fc.integer({ min: 1, max: 1000 }),
      end: fc.integer({ min: 1, max: 1000 }),
      sequence: proteinSequenceArbitrary(10, 50),
    }),
    match: fc.string({ minLength: 10, maxLength: 50 }).map(s => 
      s.split('').map(c => Math.random() > 0.7 ? (Math.random() > 0.5 ? ' ' : '+') : c).join('')
    ),
    subject: fc.record({
      start: fc.integer({ min: 1, max: 1000 }),
      end: fc.integer({ min: 1, max: 1000 }),
      sequence: proteinSequenceArbitrary(10, 50),
    }),
  });
};

/**
 * Arbitrary for BlastAlignment
 */
export const blastAlignmentArbitrary = (): fc.Arbitrary<BlastAlignment> => {
  return fc.record({
    score: fc.string({ minLength: 1, maxLength: 20 }),
    identities: fc.string({ minLength: 1, maxLength: 20 }),
    expect: fc.string({ minLength: 1, maxLength: 20 }),
    alignments: fc.array(alignmentGroupArbitrary(), { minLength: 1, maxLength: 3 }),
  });
};
