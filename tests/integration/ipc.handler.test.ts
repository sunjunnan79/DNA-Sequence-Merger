import { IPCHandler } from '../../src/main/handlers/ipc.handler';
import { DatabaseService } from '../../src/main/services/database.service';
import { FileService } from '../../src/main/services/file.service';
import { SequenceProcessor } from '../../src/main/services/sequence.processor';
import { BlastService } from '../../src/main/services/blast.service';
import { DocumentGenerator } from '../../src/main/services/document.generator';
import type { MergeRule, SequenceFile } from '../../src/shared/types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('IPCHandler Integration Tests', () => {
  let dbService: DatabaseService;
  let fileService: FileService;
  let sequenceProcessor: SequenceProcessor;
  let blastService: BlastService;
  let documentGenerator: DocumentGenerator;
  let ipcHandler: IPCHandler;
  let tempDbPath: string;

  beforeEach(() => {
    // 创建临时数据库
    tempDbPath = path.join(os.tmpdir(), `test-db-${Date.now()}.db`);
    
    // 初始化服务
    dbService = new DatabaseService(tempDbPath);
    fileService = new FileService();
    sequenceProcessor = new SequenceProcessor(fileService);
    blastService = new BlastService();
    documentGenerator = new DocumentGenerator();
    
    // 创建IPC处理器
    ipcHandler = new IPCHandler(
      dbService,
      fileService,
      sequenceProcessor,
      blastService,
      documentGenerator
    );
  });

  afterEach(() => {
    // 清理临时数据库
    if (dbService) {
      dbService.close();
    }
    if (fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath);
    }
  });

  describe('Rule Management', () => {
    it('should create, retrieve, and delete rules through IPC handlers', async () => {
      // 创建测试规则
      const testRule: Omit<MergeRule, 'id' | 'createdAt' | 'updatedAt'> = {
        name: 'Test Rule',
        description: 'Integration test rule',
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
            endSequence: 'TTAAGG',
            includeStart: false,
            includeEnd: true,
          },
        ],
      };

      // 模拟IPC事件对象
      const mockEvent = {} as Electron.IpcMainInvokeEvent;

      // 测试保存规则
      const savedRule = await (ipcHandler as any).handleSaveRule(mockEvent, testRule);
      expect(savedRule).toBeDefined();
      expect(savedRule.id).toBeDefined();
      expect(savedRule.name).toBe(testRule.name);
      expect(savedRule.fragments).toHaveLength(2);

      // 测试获取所有规则
      const allRules = await (ipcHandler as any).handleGetRules();
      expect(allRules).toHaveLength(1);
      expect(allRules[0].id).toBe(savedRule.id);

      // 测试删除规则
      await (ipcHandler as any).handleDeleteRule(mockEvent, savedRule.id!);
      
      // 验证删除成功
      const rulesAfterDelete = await (ipcHandler as any).handleGetRules();
      expect(rulesAfterDelete).toHaveLength(0);
    });

    it('should update existing rules', async () => {
      const mockEvent = {} as Electron.IpcMainInvokeEvent;

      // 创建初始规则
      const initialRule: Omit<MergeRule, 'id' | 'createdAt' | 'updatedAt'> = {
        name: 'Initial Rule',
        description: 'Original description',
        fragments: [
          {
            order: 1,
            filePattern: 'pattern1',
            includeStart: true,
            includeEnd: false,
          },
        ],
      };

      const savedRule = await (ipcHandler as any).handleSaveRule(mockEvent, initialRule);

      // 更新规则
      const updatedRule: MergeRule = {
        ...savedRule,
        description: 'Updated description',
        fragments: [
          {
            order: 1,
            filePattern: 'pattern1',
            includeStart: false,
            includeEnd: true,
          },
          {
            order: 2,
            filePattern: 'pattern2',
            includeStart: true,
            includeEnd: true,
          },
        ],
      };

      const result = await (ipcHandler as any).handleSaveRule(mockEvent, updatedRule);
      
      expect(result.id).toBe(savedRule.id);
      expect(result.description).toBe('Updated description');
      expect(result.fragments).toHaveLength(2);
    });
  });

  describe('Configuration Management', () => {
    it('should save and retrieve configuration values', async () => {
      const mockEvent = {} as Electron.IpcMainInvokeEvent;

      // 保存配置
      const testConfig = {
        subjectSequence: 'MKTAYIAKQRQISFVK',
        outputPath: '/path/to/output',
      };

      await (ipcHandler as any).handleSaveConfig(mockEvent, 'testConfig', testConfig);

      // 获取配置
      const retrievedConfig = await (ipcHandler as any).handleGetConfig(mockEvent, 'testConfig');
      
      expect(retrievedConfig).toEqual(testConfig);
    });

    it('should handle non-existent configuration keys', async () => {
      const mockEvent = {} as Electron.IpcMainInvokeEvent;

      const result = await (ipcHandler as any).handleGetConfig(mockEvent, 'nonExistentKey');
      
      expect(result).toBeUndefined();
    });
  });

  describe('File Operations', () => {
    it('should scan files and group them correctly', async () => {
      const mockEvent = {} as Electron.IpcMainInvokeEvent;

      // 创建临时测试目录和文件
      const tempDir = path.join(os.tmpdir(), `test-scan-${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });

      try {
        // 创建测试文件
        const testFiles = [
          'pETUpstream(sample1).ab1',
          'HpaB554(sample1).ab1',
          'pETUpstream(sample2).abi',
          'DuetDOWN1(sample2).abi',
        ];

        for (const filename of testFiles) {
          const filePath = path.join(tempDir, filename);
          fs.writeFileSync(filePath, 'ATGCATGC'); // 简单的测试内容
        }

        // 扫描文件
        const groups = await (ipcHandler as any).handleScanFiles(mockEvent, tempDir);

        // 验证分组
        expect(groups).toHaveLength(2);
        
        const sample1Group = groups.find((g: any) => g.groupName === '(sample1)');
        const sample2Group = groups.find((g: any) => g.groupName === '(sample2)');

        expect(sample1Group).toBeDefined();
        expect(sample1Group.files).toHaveLength(2);
        
        expect(sample2Group).toBeDefined();
        expect(sample2Group.files).toHaveLength(2);
      } finally {
        // 清理临时文件
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      }
    });
  });

  describe('Sequence Processing', () => {
    it('should process sequences through IPC handler', async () => {
      const mockEvent = {} as Electron.IpcMainInvokeEvent;

      // 创建临时测试文件
      const tempDir = path.join(os.tmpdir(), `test-process-${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });

      try {
        // 创建测试序列文件
        const file1Path = path.join(tempDir, 'test(group1).seq');
        const file2Path = path.join(tempDir, 'test2(group1).seq');
        
        // 写入有效的DNA序列（可以翻译为蛋白质）
        fs.writeFileSync(file1Path, 'ATGATGATG'); // 翻译为 MMM
        fs.writeFileSync(file2Path, 'GCAGCAGCA'); // 翻译为 AAA

        // 创建测试规则
        const testRule: MergeRule = {
          id: 1,
          name: 'Test Rule',
          description: 'Test',
          fragments: [
            {
              order: 1,
              filePattern: 'test',
              includeStart: true,
              includeEnd: true,
            },
            {
              order: 2,
              filePattern: 'test2',
              includeStart: true,
              includeEnd: true,
            },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        // 创建测试文件列表
        const testFiles: SequenceFile[] = [
          {
            path: file1Path,
            filename: 'test(group1).seq',
            group: '(group1)',
            pattern: 'test',
            size: 9,
          },
          {
            path: file2Path,
            filename: 'test2(group1).seq',
            group: '(group1)',
            pattern: 'test2',
            size: 9,
          },
        ];

        // 处理序列
        const results = await (ipcHandler as any).handleProcessSequences(mockEvent, {
          rule: testRule,
          files: testFiles,
        });

        // 验证结果
        expect(results).toHaveLength(1);
        expect(results[0].groupName).toBe('(group1)');
        expect(results[0].dnaSequence).toBe('ATGATGATGGCAGCAGCA');
        expect(results[0].proteinSequence).toBe('MMMAAA');
      } finally {
        // 清理临时文件
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle errors when deleting non-existent rules', async () => {
      const mockEvent = {} as Electron.IpcMainInvokeEvent;

      await expect(
        (ipcHandler as any).handleDeleteRule(mockEvent, 99999)
      ).rejects.toThrow();
    });

    it('should handle errors when scanning non-existent directories', async () => {
      const mockEvent = {} as Electron.IpcMainInvokeEvent;

      await expect(
        (ipcHandler as any).handleScanFiles(mockEvent, '/non/existent/path')
      ).rejects.toThrow();
    });

    it('should handle errors when processing with missing files', async () => {
      const mockEvent = {} as Electron.IpcMainInvokeEvent;

      const testRule: MergeRule = {
        id: 1,
        name: 'Test Rule',
        fragments: [
          {
            order: 1,
            filePattern: 'missing',
            includeStart: true,
            includeEnd: true,
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const testFiles: SequenceFile[] = [
        {
          path: '/non/existent/file.ab1',
          filename: 'file.ab1',
          group: '(test)',
          pattern: 'different',
          size: 0,
        },
      ];

      // 应该不会抛出错误，但会在warnings中记录
      const results = await (ipcHandler as any).handleProcessSequences(mockEvent, {
        rule: testRule,
        files: testFiles,
      });

      expect(results).toHaveLength(1);
      expect(results[0].warnings.length).toBeGreaterThan(0);
    });
  });
});
