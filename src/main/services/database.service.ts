import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { MergeRule, FragmentRule } from '../../shared/types';

export class DatabaseService {
  private db: Database.Database;
  private dbPath: string;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 100; // milliseconds

  constructor(dbPath?: string) {
    // 如果没有提供路径，使用应用数据目录
    this.dbPath = dbPath || path.join(app.getPath('userData'), 'dna-merger.db');
    this.db = new Database(this.dbPath);
    this.initialize();
  }

  /**
   * 初始化数据库schema
   */
  private initialize(): void {
    try {
      // 启用外键约束
      this.db.pragma('foreign_keys = ON');

      // 创建merge_rules表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS merge_rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          description TEXT,
          subject_sequence TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 迁移：如果 subject_sequence 列不存在，添加它
      try {
        const columns = this.db.pragma('table_info(merge_rules)') as Array<{ name: string }>;
        const hasSubjectSequence = columns.some((col) => col.name === 'subject_sequence');
        
        if (!hasSubjectSequence) {
          console.log('Migrating database: adding subject_sequence column');
          this.db.exec('ALTER TABLE merge_rules ADD COLUMN subject_sequence TEXT');
        }
      } catch (error) {
        console.warn('Migration check failed:', error);
      }

      // 创建fragment_rules表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS fragment_rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          rule_id INTEGER NOT NULL,
          order_index INTEGER NOT NULL,
          file_pattern TEXT NOT NULL,
          start_sequence TEXT,
          end_sequence TEXT,
          include_start BOOLEAN DEFAULT 0,
          include_end BOOLEAN DEFAULT 0,
          reverse_complement BOOLEAN DEFAULT 0,
          FOREIGN KEY (rule_id) REFERENCES merge_rules(id) ON DELETE CASCADE
        )
      `);

      // 迁移：旧版本的片段规则没有 reverse_complement 列，需要补齐并默认关闭。
      // 更早的实验版本曾使用 use_reverse_complement 保存同一语义；
      // 因此这里不仅要加新列，还要把旧列中已经勾选的规则同步回来，避免用户原规则看起来“丢失”。
      try {
        const fragmentColumns = this.db.pragma('table_info(fragment_rules)') as Array<{ name: string }>;
        const hasReverseComplement = fragmentColumns.some((col) => col.name === 'reverse_complement');
        const hasLegacyReverseComplement = fragmentColumns.some((col) => col.name === 'use_reverse_complement');

        if (!hasReverseComplement) {
          console.log('Migrating database: adding reverse_complement column');
          this.db.exec('ALTER TABLE fragment_rules ADD COLUMN reverse_complement BOOLEAN DEFAULT 0');
        }

        if (hasLegacyReverseComplement) {
          this.db.exec(`
            UPDATE fragment_rules
            SET reverse_complement = CASE
              WHEN COALESCE(use_reverse_complement, 0) = 1 THEN 1
              ELSE COALESCE(reverse_complement, 0)
            END
          `);
        }
      } catch (error) {
        console.warn('Fragment rule migration check failed:', error);
      }

      // 创建app_config表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS app_config (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 创建索引提升查询性能
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_fragment_rules_rule_id 
        ON fragment_rules(rule_id)
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_fragment_rules_order 
        ON fragment_rules(rule_id, order_index)
      `);
    } catch (error) {
      throw new Error(`Failed to initialize database: ${(error as Error).message}`);
    }
  }

  /**
   * 重建数据库（在数据库损坏时使用）
   */
  async rebuildDatabase(): Promise<void> {
    try {
      // 关闭当前连接
      this.db.close();

      // 备份损坏的数据库
      const backupPath = `${this.dbPath}.backup.${Date.now()}`;
      try {
        await fs.promises.copyFile(this.dbPath, backupPath);
        console.log(`Backed up corrupted database to ${backupPath}`);
      } catch (error) {
        console.warn(`Could not backup corrupted database: ${(error as Error).message}`);
      }

      // 删除损坏的数据库
      try {
        await fs.promises.unlink(this.dbPath);
      } catch (error) {
        console.warn(`Could not delete corrupted database: ${(error as Error).message}`);
      }

      // 重新创建数据库
      this.db = new Database(this.dbPath);
      this.initialize();
      
      console.log('Database rebuilt successfully');
    } catch (error) {
      throw new Error(`Failed to rebuild database: ${(error as Error).message}`);
    }
  }

  /**
   * 执行带重试的写操作
   */
  private executeWithRetry<T>(operation: () => T, operationName: string): T {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        return operation();
      } catch (error) {
        lastError = error as Error;
        const errMsg = lastError.message.toLowerCase();
        
        // 检查是否是可重试的错误
        if (errMsg.includes('database is locked') || 
            errMsg.includes('busy')) {
          
          if (attempt < this.MAX_RETRIES - 1) {
            // 同步等待后重试
            const start = Date.now();
            while (Date.now() - start < this.RETRY_DELAY * (attempt + 1)) {
              // Busy wait
            }
            continue;
          }
        }
        
        // 不可重试的错误或达到最大重试次数
        break;
      }
    }
    
    throw lastError || new Error(`${operationName} failed`);
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    this.db.close();
  }

  /**
   * 获取数据库实例（用于测试）
   */
  getDatabase(): Database.Database {
    return this.db;
  }

  /**
   * 创建新的拼接规则
   */
  createRule(rule: Omit<MergeRule, 'id' | 'createdAt' | 'updatedAt'>): MergeRule {
    return this.executeWithRetry(() => {
      const insertRule = this.db.prepare(`
        INSERT INTO merge_rules (name, description, subject_sequence)
        VALUES (?, ?, ?)
      `);

      const insertFragment = this.db.prepare(`
        INSERT INTO fragment_rules (
          rule_id, order_index, file_pattern, 
          start_sequence, end_sequence, include_start, include_end, reverse_complement
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // 使用事务确保数据一致性
      const transaction = this.db.transaction(() => {
        const result = insertRule.run(
          rule.name, 
          rule.description || null,
          rule.subjectSequence || null
        );
        const ruleId = result.lastInsertRowid as number;

        // 插入片段规则
        for (const fragment of rule.fragments) {
          insertFragment.run(
            ruleId,
            fragment.order,
            fragment.filePattern,
            fragment.startSequence || null,
            fragment.endSequence || null,
            fragment.includeStart ? 1 : 0,
            fragment.includeEnd ? 1 : 0,
            fragment.reverseComplement ? 1 : 0
          );
        }

        return ruleId;
      });

      const ruleId = transaction();
      const createdRule = this.getRule(ruleId);
      
      if (!createdRule) {
        throw new Error('Failed to create rule');
      }

      return createdRule;
    }, 'Create rule');
  }

  /**
   * 更新拼接规则
   */
  updateRule(id: number, rule: Partial<Omit<MergeRule, 'id' | 'createdAt' | 'updatedAt'>>): MergeRule {
    return this.executeWithRetry(() => {
      const updateRuleStmt = this.db.prepare(`
        UPDATE merge_rules 
        SET name = COALESCE(?, name),
            description = COALESCE(?, description),
            subject_sequence = COALESCE(?, subject_sequence),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      const deleteFragments = this.db.prepare(`
        DELETE FROM fragment_rules WHERE rule_id = ?
      `);

      const insertFragment = this.db.prepare(`
        INSERT INTO fragment_rules (
          rule_id, order_index, file_pattern, 
          start_sequence, end_sequence, include_start, include_end, reverse_complement
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // 使用事务
      const transaction = this.db.transaction(() => {
        updateRuleStmt.run(
          rule.name || null,
          rule.description !== undefined ? rule.description : null,
          rule.subjectSequence !== undefined ? rule.subjectSequence : null,
          id
        );

        // 如果提供了新的fragments，删除旧的并插入新的
        if (rule.fragments) {
          deleteFragments.run(id);
          
          for (const fragment of rule.fragments) {
            insertFragment.run(
              id,
              fragment.order,
              fragment.filePattern,
              fragment.startSequence || null,
              fragment.endSequence || null,
              fragment.includeStart ? 1 : 0,
              fragment.includeEnd ? 1 : 0,
              fragment.reverseComplement ? 1 : 0
            );
          }
        }
      });

      transaction();
      const updatedRule = this.getRule(id);
      
      if (!updatedRule) {
        throw new Error('Failed to update rule');
      }

      return updatedRule;
    }, 'Update rule');
  }

  /**
   * 删除拼接规则
   */
  deleteRule(id: number): void {
    this.executeWithRetry(() => {
      const stmt = this.db.prepare('DELETE FROM merge_rules WHERE id = ?');
      const result = stmt.run(id);
      
      if (result.changes === 0) {
        throw new Error(`Rule with id ${id} not found`);
      }
    }, 'Delete rule');
  }

  /**
   * 获取单个拼接规则
   */
  getRule(id: number): MergeRule | null {
    try {
      const ruleStmt = this.db.prepare(`
        SELECT id, name, description, subject_sequence, created_at, updated_at
        FROM merge_rules
        WHERE id = ?
      `);

      const fragmentsStmt = this.db.prepare(`
        SELECT order_index, file_pattern, start_sequence, end_sequence,
               include_start, include_end, reverse_complement
        FROM fragment_rules
        WHERE rule_id = ?
        ORDER BY order_index
      `);

      const ruleRow = ruleStmt.get(id) as any;
      
      if (!ruleRow) {
        return null;
      }

      const fragmentRows = fragmentsStmt.all(id) as any[];
      
      const fragments: FragmentRule[] = fragmentRows.map(row => ({
        order: row.order_index,
        filePattern: row.file_pattern,
        startSequence: row.start_sequence || undefined,
        endSequence: row.end_sequence || undefined,
        includeStart: Boolean(row.include_start),
        includeEnd: Boolean(row.include_end),
        reverseComplement: Boolean(row.reverse_complement),
      }));

      return {
        id: ruleRow.id,
        name: ruleRow.name,
        description: ruleRow.description || undefined,
        subjectSequence: ruleRow.subject_sequence || undefined,
        fragments,
        createdAt: new Date(ruleRow.created_at),
        updatedAt: new Date(ruleRow.updated_at),
      };
    } catch (error) {
      console.error(`Failed to get rule ${id}:`, error);
      return null;
    }
  }

  /**
   * 获取所有拼接规则
   */
  getAllRules(): MergeRule[] {
    try {
      const stmt = this.db.prepare(`
        SELECT id FROM merge_rules ORDER BY created_at DESC
      `);

      const rows = stmt.all() as { id: number }[];
      
      return rows
        .map(row => this.getRule(row.id))
        .filter((rule): rule is MergeRule => rule !== null);
    } catch (error) {
      console.error('Failed to get all rules:', error);
      return [];
    }
  }

  /**
   * 保存配置
   */
  saveConfig(key: string, value: any): void {
    this.executeWithRetry(() => {
      const stmt = this.db.prepare(`
        INSERT INTO app_config (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = CURRENT_TIMESTAMP
      `);

      const serializedValue = JSON.stringify(value);
      stmt.run(key, serializedValue);
    }, 'Save config');
  }

  /**
   * 获取配置
   */
  getConfig(key: string): any {
    try {
      const stmt = this.db.prepare(`
        SELECT value FROM app_config WHERE key = ?
      `);

      const row = stmt.get(key) as { value: string } | undefined;
      
      if (!row) {
        return undefined;
      }

      try {
        return JSON.parse(row.value);
      } catch (error) {
        console.error(`Failed to parse config value for key ${key}:`, error);
        return undefined;
      }
    } catch (error) {
      console.error(`Failed to get config for key ${key}:`, error);
      return undefined;
    }
  }
}
