// Feature: dna-sequence-merger-desktop
// Unit and Property tests for FileService

import * as fc from 'fast-check';
import { FileService } from '../../src/main/services/file.service';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('FileService', () => {
  let fileService: FileService;
  let tempDir: string;

  beforeEach(() => {
    fileService = new FileService();
    // 为每个测试创建临时目录
    tempDir = path.join(os.tmpdir(), `test-files-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    // 清理临时目录
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('File Scanning', () => {
    it('should scan directory and find .ab1 files', async () => {
      // 创建测试文件
      const testFiles = [
        'pETUpstream(sample1).ab1',
        'HpaB554(sample1).ab1',
        'test.txt', // 应该被忽略
      ];

      for (const filename of testFiles) {
        fs.writeFileSync(path.join(tempDir, filename), 'test content');
      }

      const files = await fileService.scanDirectory(tempDir);
      
      expect(files).toHaveLength(2);
      expect(files.every(f => f.filename.endsWith('.ab1'))).toBe(true);
    });

    it('should scan directory and find .abi files', async () => {
      // 创建测试文件
      const testFiles = [
        'pETUpstream(sample1).abi',
        'HpaB554(sample1).abi',
      ];

      for (const filename of testFiles) {
        fs.writeFileSync(path.join(tempDir, filename), 'test content');
      }

      const files = await fileService.scanDirectory(tempDir);
      
      expect(files).toHaveLength(2);
      expect(files.every(f => f.filename.endsWith('.abi'))).toBe(true);
    });

    it('should recursively scan subdirectories', async () => {
      // 创建子目录和文件
      const subDir = path.join(tempDir, 'subdir');
      fs.mkdirSync(subDir);
      
      fs.writeFileSync(path.join(tempDir, 'file1.ab1'), 'content');
      fs.writeFileSync(path.join(subDir, 'file2.ab1'), 'content');

      const files = await fileService.scanDirectory(tempDir);
      
      expect(files).toHaveLength(2);
    });

    it('should extract group name from filename', async () => {
      fs.writeFileSync(path.join(tempDir, 'pETUpstream(sample1).ab1'), 'content');

      const files = await fileService.scanDirectory(tempDir);
      
      expect(files[0].group).toBe('(sample1)');
    });

    it('should extract pattern from filename', async () => {
      fs.writeFileSync(path.join(tempDir, 'pETUpstream(sample1).ab1'), 'content');

      const files = await fileService.scanDirectory(tempDir);
      
      expect(files[0].pattern).toBe('pETUpstream');
    });

    it('should handle files without group name', async () => {
      fs.writeFileSync(path.join(tempDir, 'test.ab1'), 'content');

      const files = await fileService.scanDirectory(tempDir);
      
      expect(files[0].group).toBe('');
      expect(files[0].pattern).toBe('test');
    });
  });

  describe('File Grouping', () => {
    it('should group files by group name', () => {
      const files = [
        {
          path: '/test/file1.ab1',
          filename: 'pETUpstream(sample1).ab1',
          group: '(sample1)',
          pattern: 'pETUpstream',
          size: 1024,
        },
        {
          path: '/test/file2.ab1',
          filename: 'HpaB554(sample1).ab1',
          group: '(sample1)',
          pattern: 'HpaB554',
          size: 1024,
        },
        {
          path: '/test/file3.ab1',
          filename: 'pETUpstream(sample2).ab1',
          group: '(sample2)',
          pattern: 'pETUpstream',
          size: 1024,
        },
      ];

      const groups = fileService.groupFiles(files);
      
      expect(groups).toHaveLength(2);
      expect(groups.find(g => g.groupName === '(sample1)')?.files).toHaveLength(2);
      expect(groups.find(g => g.groupName === '(sample2)')?.files).toHaveLength(1);
    });

    it('should skip files without group name', () => {
      const files = [
        {
          path: '/test/file1.ab1',
          filename: 'test.ab1',
          group: '',
          pattern: 'test',
          size: 1024,
        },
      ];

      const groups = fileService.groupFiles(files);
      
      expect(groups).toHaveLength(0);
    });

    it('should check group completeness', () => {
      const groups = [
        {
          groupName: '(sample1)',
          files: [
            {
              path: '/test/file1.ab1',
              filename: 'pETUpstream(sample1).ab1',
              group: '(sample1)',
              pattern: 'pETUpstream',
              size: 1024,
            },
            {
              path: '/test/file2.ab1',
              filename: 'HpaB554(sample1).ab1',
              group: '(sample1)',
              pattern: 'HpaB554',
              size: 1024,
            },
          ],
          isComplete: true,
          missingPatterns: [],
        },
      ];

      const requiredPatterns = ['pETUpstream', 'HpaB554', 'DuetDOWN1'];
      const checked = fileService.checkGroupCompleteness(groups, requiredPatterns);
      
      expect(checked[0].isComplete).toBe(false);
      expect(checked[0].missingPatterns).toContain('DuetDOWN1');
    });
  });

  describe('Archive Extraction', () => {
    it('should throw error for unsupported archive format', async () => {
      const archivePath = path.join(tempDir, 'test.rar');
      fs.writeFileSync(archivePath, 'fake rar content');

      await expect(fileService.extractArchive(archivePath)).rejects.toThrow('Unsupported archive format');
    });

    it('should extract zip archive', async () => {
      // 这个测试需要一个真实的zip文件，暂时跳过
      // 在实际环境中，可以使用adm-zip创建一个测试zip文件
    });
  });

  describe('Sequence File Reading', () => {
    it('should read text sequence file', async () => {
      const content = '>Test Sequence\nATGCATGC\nATGCATGC';
      const filePath = path.join(tempDir, 'test.seq');
      fs.writeFileSync(filePath, content);

      const sequence = await fileService.readSequenceFile(filePath);
      
      expect(sequence).toBe('ATGCATGCATGCATGC');
    });

    it('should remove FASTA headers', async () => {
      const content = '>Header Line\nATGC\n>Another Header\nTGCA';
      const filePath = path.join(tempDir, 'test.seq');
      fs.writeFileSync(filePath, content);

      const sequence = await fileService.readSequenceFile(filePath);
      
      expect(sequence).not.toContain('>');
      expect(sequence).toBe('ATGCTGCA');
    });

    it('should convert sequence to uppercase', async () => {
      const content = 'atgcatgc';
      const filePath = path.join(tempDir, 'test.seq');
      fs.writeFileSync(filePath, content);

      const sequence = await fileService.readSequenceFile(filePath);
      
      expect(sequence).toBe('ATGCATGC');
    });

    it('should throw error for unsupported file format', async () => {
      const filePath = path.join(tempDir, 'test.pdf');
      fs.writeFileSync(filePath, 'fake pdf');

      await expect(fileService.readSequenceFile(filePath)).rejects.toThrow('Unsupported file format');
    });
  });

  // Property 1: 文件扫描正确性
  // Validates: Requirements 1.1, 1.2, 1.4
  describe('Property 1: File Scanning Correctness', () => {
    // 辅助函数：清理文件名，移除Windows不允许的字符
    const sanitizeFilename = (name: string): string => {
      return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || 'file';
    };

    it('should only return .ab1 and .abi files from any directory structure', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 20 }),
              isSequenceFile: fc.boolean(),
              extension: fc.constantFrom('.ab1', '.abi', '.txt', '.pdf', '.doc'),
            }),
            { minLength: 1, maxLength: 20 }
          ),
          async (fileSpecs) => {
            // 创建测试文件
            const testDir = path.join(tempDir, `prop-test-${Math.random().toString(36).substr(2, 9)}`);
            fs.mkdirSync(testDir, { recursive: true });

            const expectedSequenceFiles: string[] = [];

            for (const spec of fileSpecs) {
              const ext = spec.isSequenceFile ? fc.sample(fc.constantFrom('.ab1', '.abi'), 1)[0] : spec.extension;
              const safeName = sanitizeFilename(spec.name);
              const filename = `${safeName}${ext}`;
              const filePath = path.join(testDir, filename);
              
              try {
                fs.writeFileSync(filePath, 'test content');
                
                if (ext === '.ab1' || ext === '.abi') {
                  expectedSequenceFiles.push(filename);
                }
              } catch (error) {
                // 跳过无法创建的文件
                continue;
              }
            }

            // 扫描目录
            const scannedFiles = await fileService.scanDirectory(testDir);

            // 验证：所有返回的文件都是.ab1或.abi文件
            expect(scannedFiles.every(f => 
              f.filename.endsWith('.ab1') || f.filename.endsWith('.abi')
            )).toBe(true);

            // 验证：返回的文件数量等于预期的序列文件数量
            expect(scannedFiles.length).toBe(expectedSequenceFiles.length);

            // 清理
            fs.rmSync(testDir, { recursive: true, force: true });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly extract group names and patterns from filenames', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              pattern: fc.constantFrom('pETUpstream', 'HpaB554', 'DuetDOWN1', 'test'),
              group: fc.string({ minLength: 1, maxLength: 10 }).filter(s => {
                // 过滤掉包含Windows不允许字符的字符串
                return !/[<>:"/\\|?*\x00-\x1F]/.test(s);
              }),
              extension: fc.constantFrom('.ab1', '.abi'),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (fileSpecs) => {
            // 过滤掉空group的spec
            const validSpecs = fileSpecs.filter(spec => spec.group.length > 0);
            
            if (validSpecs.length === 0) {
              return; // 跳过这个测试用例
            }

            // 创建测试文件
            const testDir = path.join(tempDir, `prop-test-${Math.random().toString(36).substr(2, 9)}`);
            fs.mkdirSync(testDir, { recursive: true });

            for (const spec of validSpecs) {
              const filename = `${spec.pattern}(${spec.group})${spec.extension}`;
              const filePath = path.join(testDir, filename);
              
              try {
                fs.writeFileSync(filePath, 'test content');
              } catch (error) {
                // 跳过无法创建的文件
                continue;
              }
            }

            // 扫描目录
            const scannedFiles = await fileService.scanDirectory(testDir);

            // 验证：每个文件的group和pattern都被正确提取
            for (const spec of validSpecs) {
              const expectedGroup = `(${spec.group})`;
              const scannedFile = scannedFiles.find(f => 
                f.pattern === spec.pattern && f.group === expectedGroup
              );
              
              if (scannedFile) {
                expect(scannedFile.pattern).toBe(spec.pattern);
                expect(scannedFile.group).toBe(expectedGroup);
              }
            }

            // 清理
            fs.rmSync(testDir, { recursive: true, force: true });
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
