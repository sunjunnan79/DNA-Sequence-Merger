// 测试辅助函数

import type { MergeRule, FragmentRule, SequenceFile, FileGroup } from '../../src/shared/types';

/**
 * 创建测试用的拼接规则
 */
export function createTestMergeRule(overrides?: Partial<MergeRule>): MergeRule {
  return {
    id: 1,
    name: 'Test Rule',
    description: 'A test merge rule',
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
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * 创建测试用的片段规则
 */
export function createTestFragmentRule(overrides?: Partial<FragmentRule>): FragmentRule {
  return {
    order: 1,
    filePattern: 'test-pattern',
    includeStart: false,
    includeEnd: false,
    ...overrides,
  };
}

/**
 * 创建测试用的序列文件
 */
export function createTestSequenceFile(overrides?: Partial<SequenceFile>): SequenceFile {
  return {
    path: '/test/path/file.ab1',
    filename: 'test(sample1)pETUpstream.ab1',
    group: 'sample1',
    pattern: 'pETUpstream',
    size: 1024,
    ...overrides,
  };
}

/**
 * 创建测试用的文件组
 */
export function createTestFileGroup(overrides?: Partial<FileGroup>): FileGroup {
  return {
    groupName: 'sample1',
    files: [
      createTestSequenceFile(),
      createTestSequenceFile({
        filename: 'test(sample1)HpaB554.ab1',
        pattern: 'HpaB554',
      }),
    ],
    isComplete: true,
    missingPatterns: [],
    ...overrides,
  };
}

/**
 * 生成随机DNA序列
 */
export function generateRandomDNA(length: number): string {
  const bases = ['A', 'T', 'G', 'C'];
  let sequence = '';
  for (let i = 0; i < length; i++) {
    sequence += bases[Math.floor(Math.random() * bases.length)];
  }
  return sequence;
}

/**
 * 生成随机蛋白质序列
 */
export function generateRandomProtein(length: number): string {
  const aminoAcids = 'ACDEFGHIKLMNPQRSTVWY';
  let sequence = '';
  for (let i = 0; i < length; i++) {
    sequence += aminoAcids[Math.floor(Math.random() * aminoAcids.length)];
  }
  return sequence;
}

/**
 * 延迟函数（用于异步测试）
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 创建临时目录路径（用于文件测试）
 */
export function createTempPath(prefix: string = 'test'): string {
  return `/tmp/${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
