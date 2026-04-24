// 测试用的示例数据

import type { MergeRule, SequenceFile, FileGroup, BlastAlignment } from '../../src/shared/types';

/**
 * 示例拼接规则
 */
export const sampleMergeRule: MergeRule = {
  id: 1,
  name: 'Standard Merge Rule',
  description: 'Standard rule for merging DNA sequences',
  fragments: [
    {
      order: 1,
      filePattern: 'pETUpstream',
      startSequence: 'ATGAAA',
      includeStart: true,
      includeEnd: false,
    },
    {
      order: 2,
      filePattern: 'HpaB554',
      includeStart: false,
      includeEnd: false,
    },
    {
      order: 3,
      filePattern: 'DuetDOWN1',
      endSequence: 'TTATTT',
      includeStart: false,
      includeEnd: true,
    },
  ],
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

/**
 * 示例序列文件
 */
export const sampleSequenceFiles: SequenceFile[] = [
  {
    path: '/test/data/sample1_pETUpstream.ab1',
    filename: 'sample1_pETUpstream.ab1',
    group: 'sample1',
    pattern: 'pETUpstream',
    size: 2048,
  },
  {
    path: '/test/data/sample1_HpaB554.ab1',
    filename: 'sample1_HpaB554.ab1',
    group: 'sample1',
    pattern: 'HpaB554',
    size: 3072,
  },
  {
    path: '/test/data/sample1_DuetDOWN1.ab1',
    filename: 'sample1_DuetDOWN1.ab1',
    group: 'sample1',
    pattern: 'DuetDOWN1',
    size: 2560,
  },
];

/**
 * 示例文件组
 */
export const sampleFileGroup: FileGroup = {
  groupName: 'sample1',
  files: sampleSequenceFiles,
  isComplete: true,
  missingPatterns: [],
};

/**
 * 示例DNA序列
 */
export const sampleDNASequences = {
  short: 'ATGAAACCCGGGTTT',
  medium: 'ATGAAACCCGGGTTTAAACCCGGGTTTAAACCCGGGTTTAAACCCGGGTTT',
  long: 'ATGAAACCCGGGTTTAAACCCGGGTTTAAACCCGGGTTTAAACCCGGGTTTAAACCCGGGTTTAAACCCGGGTTTAAACCCGGGTTTAAACCCGGGTTT',
  withStopCodon: 'ATGAAACCCGGGTAATTT', // TAA is stop codon
};

/**
 * 示例蛋白质序列
 */
export const sampleProteinSequences = {
  short: 'MKPGF',
  medium: 'MKPGFKPGFKPGFKPGF',
  long: 'MKPGFKPGFKPGFKPGFKPGFKPGFKPGFKPGF',
};

/**
 * 示例BLAST对比结果
 */
export const sampleBlastAlignment: BlastAlignment = {
  score: '150',
  identities: '95%',
  expect: '1e-50',
  alignments: [
    {
      query: {
        start: 1,
        end: 50,
        sequence: 'MKPGFKPGFKPGFKPGFKPGFKPGFKPGFKPGFKPGFKPGFKPGFKPGF',
      },
      match: '||||||||||||||||||||||||||||||||||||||||||||||||',
      subject: {
        start: 1,
        end: 50,
        sequence: 'MKPGFKPGFKPGFKPGFKPGFKPGFKPGFKPGFKPGFKPGFKPGFKPGF',
      },
    },
  ],
};

/**
 * 示例BLAST对比结果（带突变）
 */
export const sampleBlastAlignmentWithMutations: BlastAlignment = {
  score: '140',
  identities: '90%',
  expect: '1e-45',
  alignments: [
    {
      query: {
        start: 1,
        end: 50,
        sequence: 'MKPGFKPGFKPGFKPGFKPGFKPGFKPGFKPGFKPGFKPGFKPGFKPGF',
      },
      match: '|||||||||||||||||||| |||||||||||||||||||||||||||',
      subject: {
        start: 1,
        end: 50,
        sequence: 'MKPGFKPGFKPGFKPGFKPGAKPGFKPGFKPGFKPGFKPGFKPGFKPGF',
      },
    },
  ],
};

/**
 * 遗传密码表（用于测试）
 */
export const CODON_TABLE: Record<string, string> = {
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
