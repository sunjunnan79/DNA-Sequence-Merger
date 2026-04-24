# 功能更新说明

## 更新日期
2024-03-02

## 更新内容

### 1. 参考序列与规则集关联

#### 问题
之前参考蛋白质序列（Subject Sequence）是独立存储的，每次处理都需要重新输入，不方便。

#### 解决方案
将参考序列作为拼接规则的一部分进行保存和管理。

#### 修改的文件

**1. `src/shared/types.ts`**
- 在 `MergeRule` 接口中添加 `subjectSequence?: string` 字段
- 在 `ElectronAPI` 接口中添加 `generateOutputPath()` 方法

**2. `src/main/services/database.service.ts`**
- 数据库表 `merge_rules` 添加 `subject_sequence` 字段
- 更新 `createRule()` 方法，支持保存参考序列
- 更新 `updateRule()` 方法，支持更新参考序列
- 更新 `getRule()` 方法，读取参考序列

**3. `src/main/handlers/ipc.handler.ts`**
- 添加 `handleGenerateOutputPath()` 方法，自动生成输出路径
- 注册 `generate-output-path` IPC 处理器

**4. `src/preload/preload.ts`**
- 暴露 `generateOutputPath()` API 给渲染进程

#### 使用方式

```typescript
// 创建规则时包含参考序列
const rule: MergeRule = {
  name: '标准拼接规则',
  description: '用于常规DNA序列拼接',
  subjectSequence: 'MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEKAVQVKVKALPDAQFEVVHSLAKWKRQTLGQHDFSAGEGLYTHMKALRPDEDRLSPLHSVYVDQWDWERVMGDGERQFSTLKSTVEAIWAGIKATEAAVSEEFGLAPFLPDQIHFVHSQELLSRYPDLDAKGRERAIAKDLGAVFLVGIGGKLSDGHRHDVRAPDYDDWSTPSELGHAGLNGDILVWNPVLEDAFELSSMGIRVDADTLKHQLALTGDEDRLELEWHQALLRGEMPQTIGGGIGQSRLTMLLLQLPHIGQVQAGVWPAAVRESVPSLL',
  fragments: [
    { order: 1, filePattern: 'pETUpstream', includeStart: false, includeEnd: false },
    { order: 2, filePattern: 'HpaB554', includeStart: false, includeEnd: false }
  ],
  createdAt: new Date(),
  updatedAt: new Date()
};

await window.electronAPI.saveRule(rule);
```

---

### 2. 自动生成输出路径

#### 问题
每次处理都需要手动选择输出路径，操作繁琐。

#### 解决方案
根据输入的文件夹或压缩包路径，自动生成输出文件路径。

#### 生成规则

输出文件名格式：`{原文件名}_结果_{时间戳}.docx`

示例：
- 输入：`C:\Users\Desktop\张翀_2270357268_测序结果.zip`
- 输出：`C:\Users\Desktop\张翀_2270357268_测序结果_结果_2024-03-02T14-30-00.docx`

#### API 使用

```typescript
// 自动生成输出路径
const inputPath = 'C:\\Users\\Desktop\\测序数据.zip';
const outputPath = await window.electronAPI.generateOutputPath(inputPath);
console.log(outputPath);
// 输出: C:\Users\Desktop\测序数据_结果_2024-03-02T14-30-00.docx
```

---

## 数据库迁移

### 现有数据库更新

如果你已经有现有的数据库，需要手动添加 `subject_sequence` 字段：

```sql
ALTER TABLE merge_rules ADD COLUMN subject_sequence TEXT;
```

或者删除现有数据库，让应用重新创建（会丢失现有规则）：

**Windows**: 删除 `%USERPROFILE%\AppData\Roaming\dna-sequence-merger-desktop\dna-merger.db`
**macOS**: 删除 `~/Library/Application Support/dna-sequence-merger-desktop/dna-merger.db`
**Linux**: 删除 `~/.config/dna-sequence-merger-desktop/dna-merger.db`

---

## 前端 UI 更新建议

### 规则编辑器组件更新

需要在规则编辑器中添加参考序列输入框：

```tsx
// RuleEditor.tsx
<div className="form-group">
  <label>参考蛋白质序列（用于BLAST对比）</label>
  <textarea
    value={rule.subjectSequence || ''}
    onChange={(e) => setRule({ ...rule, subjectSequence: e.target.value })}
    placeholder="输入参考蛋白质序列..."
    rows={5}
  />
</div>
```

### 处理面板组件更新

1. **移除独立的参考序列输入框**
   - 参考序列现在从选中的规则中获取

2. **自动生成输出路径**
   - 当用户导入文件后，自动调用 `generateOutputPath()` 生成输出路径
   - 用户仍可手动修改输出路径

```tsx
// ProcessPanel.tsx
const handleFileImport = async (inputPath: string) => {
  // 扫描文件
  const groups = await window.electronAPI.scanFiles(inputPath);
  setFileGroups(groups);
  
  // 自动生成输出路径
  const autoOutputPath = await window.electronAPI.generateOutputPath(inputPath);
  setOutputPath(autoOutputPath);
};
```

---

## 测试建议

### 1. 测试参考序列保存
- [ ] 创建新规则并包含参考序列
- [ ] 保存规则后重新加载，验证参考序列是否正确保存
- [ ] 更新规则的参考序列
- [ ] 删除规则，验证数据库一致性

### 2. 测试输出路径生成
- [ ] 导入文件夹，验证输出路径格式
- [ ] 导入 ZIP 压缩包，验证输出路径格式
- [ ] 导入 RAR 压缩包，验证输出路径格式
- [ ] 验证时间戳格式正确
- [ ] 验证中文路径处理正确

### 3. 集成测试
- [ ] 完整流程：创建规则（含参考序列）→ 导入文件 → 自动生成输出路径 → 处理 → 生成文档
- [ ] 验证 BLAST 对比使用规则中的参考序列
- [ ] 验证输出文档保存到自动生成的路径

---

## 向后兼容性

### 现有规则
- 现有规则的 `subjectSequence` 字段为 `undefined`
- 不影响现有功能
- 用户可以编辑现有规则添加参考序列

### API 兼容性
- 所有现有 API 保持不变
- 新增的 API 不影响现有功能
- 完全向后兼容

---

## 后续优化建议

1. **规则模板**
   - 提供常用规则模板（包含参考序列）
   - 用户可以基于模板快速创建规则

2. **参考序列库**
   - 建立常用参考序列库
   - 用户可以从库中选择而不是每次输入

3. **输出路径模板**
   - 允许用户自定义输出路径格式
   - 支持更多变量（日期、规则名等）

4. **批量处理**
   - 支持一次导入多个文件夹/压缩包
   - 自动为每个输入生成对应的输出路径

---

## 相关文档

- [数据库设计](./DATABASE_SCHEMA.md)
- [API 文档](./API_REFERENCE.md)
- [用户指南](./USER_GUIDE.md)
