# UI 改进总结

## 实现的功能

### 1. 参考蛋白质序列与规则关联 ✅

**改动说明**:
- 将参考蛋白质序列从处理面板移到了规则编辑器中
- 每个规则现在都可以保存自己的参考蛋白质序列
- 数据库已添加 `subject_sequence` 字段并包含自动迁移逻辑

**修改的文件**:
1. `src/shared/types.ts` - MergeRule 接口已包含 `subjectSequence` 字段
2. `src/main/services/database.service.ts` - 数据库 schema 已包含迁移逻辑
3. `src/renderer/components/RuleEditor.tsx` - 添加了参考蛋白质序列输入框
4. `src/renderer/components/ProcessPanel.tsx` - 移除了参考序列输入，改为使用规则中的序列

**用户体验**:
- 用户在创建/编辑规则时可以设置参考蛋白质序列
- 参考序列与规则一起保存，无需每次处理时重新输入
- 不同的规则可以使用不同的参考序列

### 2. 自动生成输出路径 ✅

**改动说明**:
- 导入文件或压缩包时自动生成输出路径
- 输出路径基于源文件路径，添加 `_结果.docx` 后缀
- 用户仍可手动修改输出路径

**修改的文件**:
1. `src/renderer/context/AppContext.tsx` - 添加了 `sourcePath` 状态
2. `src/renderer/components/FileImport.tsx` - 导入时自动生成输出路径
3. `src/renderer/components/ProcessPanel.tsx` - 使用自动生成的输出路径

**路径生成逻辑**:
```typescript
// 示例：
// 输入: C:\Users\Desktop\测序结果.zip
// 输出: C:\Users\Desktop\测序结果_结果.docx

// 输入: C:\Users\Desktop\实验数据
// 输出: C:\Users\Desktop\实验数据_结果.docx
```

**用户体验**:
- 导入文件后立即看到自动生成的输出路径
- 减少手动操作步骤
- 输出文件与源文件在同一目录，便于管理

## UI 布局变化

### 规则编辑器（左下角）
```
┌─────────────────────────────────┐
│ 规则名称: [输入框]              │
│ 描述: [文本框]                  │
│ 参考蛋白质序列: [文本框] ← 新增 │
│ 片段规则:                       │
│   - 片段 #1                     │
│   - 片段 #2                     │
│ [保存] [取消]                   │
└─────────────────────────────────┘
```

### 处理面板（右侧）
```
┌─────────────────────────────────┐
│ 当前规则: 标准拼接规则          │
│ 文件组数: 16                    │
│ 参考序列: 已配置 ← 显示状态     │
│                                 │
│ 输出路径: [自动生成的路径]      │
│ [浏览...]                       │
│                                 │
│ [开始处理]                      │
└─────────────────────────────────┘
```

## 数据库变更

### merge_rules 表
```sql
CREATE TABLE merge_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  subject_sequence TEXT,  -- 新增字段
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 自动迁移
应用启动时会自动检查并添加 `subject_sequence` 列（如果不存在），无需手动迁移数据库。

## 状态管理变更

### AppState 接口
```typescript
export interface AppState {
  files: FileGroup[];
  rules: MergeRule[];
  selectedRule: MergeRule | null;
  sourcePath: string;      // 新增：源文件路径
  outputPath: string;      // 自动生成
  processing: boolean;
  progress: number;
  logs: LogEntry[];
}
```

### 新增 Action
- `SET_SOURCE_PATH` - 设置源文件路径
- 移除 `SET_SUBJECT` - 不再需要单独管理参考序列

## 工作流程

### 旧流程
1. 导入文件
2. 选择规则
3. **手动输入参考蛋白质序列** ❌
4. **手动选择输出路径** ❌
5. 开始处理

### 新流程
1. 导入文件 → **自动生成输出路径** ✅
2. 选择规则 → **自动加载规则中的参考序列** ✅
3. 开始处理

## 优势

### 1. 减少重复操作
- 参考序列只需在规则中配置一次
- 输出路径自动生成，无需每次手动选择

### 2. 提高一致性
- 同一规则始终使用相同的参考序列
- 避免因手动输入错误导致的问题

### 3. 更好的组织
- 规则和参考序列逻辑上关联在一起
- 输出文件与源文件在同一位置，便于管理

### 4. 灵活性
- 用户仍可手动修改输出路径
- 可以为不同规则设置不同的参考序列

## 向后兼容

- 现有规则会自动迁移，`subject_sequence` 字段为空
- 用户可以编辑现有规则来添加参考序列
- 如果规则没有参考序列，BLAST 对比步骤会被跳过

## 测试建议

1. **创建新规则**
   - 验证可以输入参考蛋白质序列
   - 验证序列与规则一起保存

2. **编辑现有规则**
   - 验证可以为现有规则添加参考序列
   - 验证更新后的规则正确保存

3. **导入文件**
   - 验证输出路径自动生成
   - 验证路径格式正确

4. **处理序列**
   - 验证使用规则中的参考序列
   - 验证输出文件保存到正确位置

5. **边界情况**
   - 规则没有参考序列时的处理
   - 输出路径已存在时的处理
   - 特殊字符文件名的处理

## 未来改进建议

1. **输出路径模板**
   - 允许用户自定义输出文件名格式
   - 支持变量如 `{date}`, `{rule_name}`, `{group_count}` 等

2. **批量处理**
   - 支持一次导入多个文件夹/压缩包
   - 为每个源生成独立的输出文件

3. **历史记录**
   - 记录最近使用的规则和输出路径
   - 快速重复上次的处理操作

4. **参考序列库**
   - 创建常用参考序列的库
   - 在规则中快速选择而不是每次输入
