// Feature: dna-sequence-merger-desktop
// Unit and Property tests for DatabaseService

import * as fc from 'fast-check';
import { DatabaseService } from '../../src/main/services/database.service';
import { mergeRuleArbitrary, configPairArbitrary } from '../utils/arbitraries';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('DatabaseService', () => {
  let dbService: DatabaseService;
  let tempDbPath: string;

  beforeEach(() => {
    // 为每个测试创建临时数据库
    tempDbPath = path.join(os.tmpdir(), `test-db-${Date.now()}-${Math.random()}.db`);
    dbService = new DatabaseService(tempDbPath);
  });

  afterEach(() => {
    // 清理
    dbService.close();
    if (fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath);
    }
  });

  describe('Database Initialization', () => {
    it('should create database tables on initialization', () => {
      const db = dbService.getDatabase();
      
      // 检查表是否存在
      const tables = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name IN ('merge_rules', 'fragment_rules', 'app_config')
      `).all() as { name: string }[];
      
      expect(tables).toHaveLength(3);
      expect(tables.map(t => t.name)).toContain('merge_rules');
      expect(tables.map(t => t.name)).toContain('fragment_rules');
      expect(tables.map(t => t.name)).toContain('app_config');
    });

    it('should create indexes on fragment_rules', () => {
      const db = dbService.getDatabase();
      
      const indexes = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='index' AND tbl_name='fragment_rules'
      `).all() as { name: string }[];
      
      expect(indexes.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Rule CRUD Operations', () => {
    it('should create a rule with fragments', () => {
      const rule = {
        name: 'Test Rule',
        description: 'Test Description',
        fragments: [
          {
            order: 1,
            filePattern: 'pETUpstream',
            startSequence: 'ATGAAA',
            endSequence: undefined,
            includeStart: true,
            includeEnd: false,
          },
          {
            order: 2,
            filePattern: 'HpaB554',
            startSequence: undefined,
            endSequence: 'TGATGA',
            includeStart: false,
            includeEnd: true,
          },
        ],
      };

      const created = dbService.createRule(rule);
      
      expect(created.id).toBeDefined();
      expect(created.name).toBe(rule.name);
      expect(created.description).toBe(rule.description);
      expect(created.fragments).toHaveLength(2);
      expect(created.createdAt).toBeInstanceOf(Date);
      expect(created.updatedAt).toBeInstanceOf(Date);
    });

    it('should retrieve a rule by id', () => {
      const rule = {
        name: 'Test Rule',
        fragments: [
          {
            order: 1,
            filePattern: 'pETUpstream',
            includeStart: true,
            includeEnd: false,
          },
        ],
      };

      const created = dbService.createRule(rule);
      const retrieved = dbService.getRule(created.id!);
      
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.name).toBe(created.name);
    });

    it('should return null for non-existent rule', () => {
      const retrieved = dbService.getRule(99999);
      expect(retrieved).toBeNull();
    });

    it('should update a rule', () => {
      const rule = {
        name: 'Original Name',
        fragments: [
          {
            order: 1,
            filePattern: 'pETUpstream',
            includeStart: true,
            includeEnd: false,
          },
        ],
      };

      const created = dbService.createRule(rule);
      const updated = dbService.updateRule(created.id!, {
        name: 'Updated Name',
        description: 'New Description',
      });
      
      expect(updated.name).toBe('Updated Name');
      expect(updated.description).toBe('New Description');
    });

    it('should delete a rule', () => {
      const rule = {
        name: 'To Delete',
        fragments: [
          {
            order: 1,
            filePattern: 'pETUpstream',
            includeStart: true,
            includeEnd: false,
          },
        ],
      };

      const created = dbService.createRule(rule);
      dbService.deleteRule(created.id!);
      
      const retrieved = dbService.getRule(created.id!);
      expect(retrieved).toBeNull();
    });

    it('should throw error when deleting non-existent rule', () => {
      expect(() => dbService.deleteRule(99999)).toThrow();
    });

    it('should get all rules', () => {
      const rule1 = {
        name: 'Rule 1',
        fragments: [
          {
            order: 1,
            filePattern: 'pETUpstream',
            includeStart: true,
            includeEnd: false,
          },
        ],
      };

      const rule2 = {
        name: 'Rule 2',
        fragments: [
          {
            order: 1,
            filePattern: 'HpaB554',
            includeStart: true,
            includeEnd: false,
          },
        ],
      };

      dbService.createRule(rule1);
      dbService.createRule(rule2);
      
      const allRules = dbService.getAllRules();
      expect(allRules).toHaveLength(2);
    });

    it('should cascade delete fragment_rules when rule is deleted', () => {
      const rule = {
        name: 'Cascade Test',
        fragments: [
          {
            order: 1,
            filePattern: 'pETUpstream',
            includeStart: true,
            includeEnd: false,
          },
          {
            order: 2,
            filePattern: 'HpaB554',
            includeStart: true,
            includeEnd: false,
          },
        ],
      };

      const created = dbService.createRule(rule);
      dbService.deleteRule(created.id!);
      
      // 验证fragment_rules也被删除
      const db = dbService.getDatabase();
      const fragments = db.prepare('SELECT * FROM fragment_rules WHERE rule_id = ?').all(created.id!);
      expect(fragments).toHaveLength(0);
    });
  });

  describe('Configuration Management', () => {
    it('should save and retrieve string config', () => {
      dbService.saveConfig('testKey', 'testValue');
      const value = dbService.getConfig('testKey');
      expect(value).toBe('testValue');
    });

    it('should save and retrieve object config', () => {
      const config = { foo: 'bar', num: 42 };
      dbService.saveConfig('objectKey', config);
      const value = dbService.getConfig('objectKey');
      expect(value).toEqual(config);
    });

    it('should update existing config', () => {
      dbService.saveConfig('updateKey', 'original');
      dbService.saveConfig('updateKey', 'updated');
      const value = dbService.getConfig('updateKey');
      expect(value).toBe('updated');
    });

    it('should return undefined for non-existent config', () => {
      const value = dbService.getConfig('nonExistent');
      expect(value).toBeUndefined();
    });
  });

  // Property 2: 规则持久化往返
  // Validates: Requirements 3.1, 3.3
  describe('Property 2: Rule Persistence Round Trip', () => {
    it('should preserve rule data after save and load', () => {
      fc.assert(
        fc.property(
          mergeRuleArbitrary(),
          (rule) => {
            const saved = dbService.createRule(rule);
            const loaded = dbService.getRule(saved.id!);
            
            expect(loaded).not.toBeNull();
            expect(loaded!.name).toBe(saved.name);
            expect(loaded!.description).toBe(saved.description);
            expect(loaded!.fragments).toHaveLength(saved.fragments.length);
            
            // 验证每个fragment
            for (let i = 0; i < saved.fragments.length; i++) {
              const savedFrag = saved.fragments[i];
              const loadedFrag = loaded!.fragments[i];
              
              expect(loadedFrag.order).toBe(savedFrag.order);
              expect(loadedFrag.filePattern).toBe(savedFrag.filePattern);
              expect(loadedFrag.startSequence).toBe(savedFrag.startSequence);
              expect(loadedFrag.endSequence).toBe(savedFrag.endSequence);
              expect(loadedFrag.includeStart).toBe(savedFrag.includeStart);
              expect(loadedFrag.includeEnd).toBe(savedFrag.includeEnd);
              expect(loadedFrag.reverseComplement).toBe(Boolean(savedFrag.reverseComplement));
            }
            
            // 清理：删除创建的规则以避免UNIQUE约束冲突
            dbService.deleteRule(saved.id!);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Property 3: 规则删除一致性
  // Validates: Requirements 3.4
  describe('Property 3: Rule Deletion Consistency', () => {
    it('should completely remove rule after deletion', () => {
      fc.assert(
        fc.property(
          mergeRuleArbitrary(),
          (rule) => {
            const saved = dbService.createRule(rule);
            const ruleId = saved.id!;
            
            dbService.deleteRule(ruleId);
            
            // 验证规则不存在
            const loaded = dbService.getRule(ruleId);
            expect(loaded).toBeNull();
            
            // 验证规则不在列表中
            const allRules = dbService.getAllRules();
            expect(allRules.find(r => r.id === ruleId)).toBeUndefined();
            
            // 验证fragment_rules也被删除
            const db = dbService.getDatabase();
            const fragments = db.prepare('SELECT * FROM fragment_rules WHERE rule_id = ?').all(ruleId);
            expect(fragments).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Property 9: 配置持久化往返
  // Validates: Requirements 5.1
  describe('Property 9: Config Persistence Round Trip', () => {
    it('should preserve config value after save and load', () => {
      fc.assert(
        fc.property(
          configPairArbitrary(),
          ({ key, value }) => {
            dbService.saveConfig(key, value);
            const loaded = dbService.getConfig(key);
            
            expect(loaded).toEqual(value);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
