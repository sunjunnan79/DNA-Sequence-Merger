import React, { useState, useEffect } from 'react';
import type { MergeRule, FragmentRule } from '../../shared/types';
import { useAppContext } from '../context/AppContext';

interface RuleEditorProps {
  rule: MergeRule | null;
  onSave: (rule: MergeRule) => void;
  onCancel: () => void;
}

/**
 * 规则编辑器。
 *
 * 每条规则由多个“片段提取配置”组成，顺序即最终拼接顺序。
 * 这里把字段校验尽量放在前端做一轮，减少无效请求进入数据库层。
 */
export function RuleEditor({ rule, onSave, onCancel }: RuleEditorProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [subjectSequence, setSubjectSequence] = useState('');
  const [fragments, setFragments] = useState<FragmentRule[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  useEffect(() => {
    if (rule) {
      setName(rule.name);
      setDescription(rule.description || '');
      setSubjectSequence(rule.subjectSequence || '');
      setFragments(rule.fragments);
    } else {
      setName('');
      setDescription('');
      setSubjectSequence('');
      setFragments([]);
    }
    setValidationErrors([]);
  }, [rule]);

  const validateRule = (): string[] => {
    const errors: string[] = [];

    if (name.trim() === '') {
      errors.push('规则名称不能为空');
    } else if (name.trim().length < 2) {
      errors.push('规则名称至少需要 2 个字符');
    }

    if (fragments.length === 0) {
      errors.push('至少需要添加一个片段规则');
    } else {
      fragments.forEach((fragment, index) => {
        if (fragment.filePattern.trim() === '') {
          errors.push(`片段 #${index + 1}: 文件匹配标识不能为空`);
        }

        const validDNA = /^[ATGC]+$/i;

        if (fragment.startSequence && !validDNA.test(fragment.startSequence.trim())) {
          errors.push(`片段 #${index + 1}: 起始序列只能包含 ATGC`);
        }

        if (fragment.endSequence && !validDNA.test(fragment.endSequence.trim())) {
          errors.push(`片段 #${index + 1}: 结束序列只能包含 ATGC`);
        }
      });
    }

    return errors;
  };

  /**
   * 新增一个空片段配置。
   * 使用浅拷贝即可，因为这里的片段对象结构比较简单，且每次都会整体回写状态。
   */
  const handleAddFragment = () => {
    const newFragment: FragmentRule = {
      order: fragments.length,
      filePattern: '',
      startSequence: '',
      endSequence: '',
      includeStart: false,
      includeEnd: false,
      reverseComplement: false,
    };

    setFragments([...fragments, newFragment]);
    setValidationErrors((prev) => prev.filter((error) => !error.includes('至少需要添加一个片段规则')));
  };

  const handleRemoveFragment = (index: number) => {
    const newFragments = fragments.filter((_, i) => i !== index);
    newFragments.forEach((fragment, i) => {
      fragment.order = i;
    });
    setFragments(newFragments);
  };

  const handleFragmentChange = (index: number, field: keyof FragmentRule, value: string | boolean) => {
    const newFragments = [...fragments];
    (newFragments[index] as FragmentRule)[field] = value as never;
    setFragments(newFragments);
    setValidationErrors((prev) => prev.filter((error) => !error.includes(`片段 #${index + 1}`)));
  };

  const handleMoveFragment = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === fragments.length - 1)) {
      return;
    }

    const newFragments = [...fragments];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newFragments[index], newFragments[targetIndex]] = [newFragments[targetIndex], newFragments[index]];
    newFragments.forEach((fragment, i) => {
      fragment.order = i;
    });
    setFragments(newFragments);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const errors = validateRule();
    if (errors.length > 0) {
      setValidationErrors(errors);
      alert(`请修正以下问题：\n\n${errors.map((error) => `• ${error}`).join('\n')}`);
      return;
    }

    setValidationErrors([]);

    const ruleData: MergeRule = {
      id: rule?.id,
      name: name.trim(),
      description: description.trim(),
      subjectSequence: subjectSequence.trim() || undefined,
      fragments,
      createdAt: rule?.createdAt || new Date(),
      updatedAt: new Date(),
    };

    onSave(ruleData);
  };

  return (
    <div className="rule-editor">
      <h3>{rule ? '编辑规则' : '新建规则'}</h3>

      {validationErrors.length > 0 && (
        <div className="validation-errors">
          <p className="error-title">请先修正以下问题：</p>
          <ul>
            {validationErrors.map((error, index) => (
              <li key={index} className="error-item">
                {error}
              </li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="rule-name">规则名称 *</label>
          <input
            id="rule-name"
            type="text"
            className="form-control"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setValidationErrors((prev) => prev.filter((error) => !error.includes('规则名称')));
            }}
            required
            placeholder="例如：标准三段拼接"
          />
        </div>

        <div className="form-group">
          <label htmlFor="rule-description">规则说明</label>
          <textarea
            id="rule-description"
            className="form-control"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="简要说明这个规则的适用场景"
          />
        </div>

        <div className="form-group">
          <label htmlFor="subject-sequence">BLAST 目标蛋白序列（可选）</label>
          <textarea
            id="subject-sequence"
            className="form-control"
            value={subjectSequence}
            onChange={(e) => setSubjectSequence(e.target.value.toUpperCase())}
            rows={4}
            placeholder="如需后续做 BLAST 比对，可在此填写目标蛋白序列"
          />
          <small className="form-text">如果当前阶段只需要完成序列拼接和 Word 生成，这里可以留空。</small>
        </div>

        <div className="form-group">
          <div className="form-group-header">
            <label>片段规则</label>
            <button type="button" className="btn btn-sm btn-primary" onClick={handleAddFragment}>
              + 添加片段
            </button>
          </div>

          {fragments.length === 0 ? (
            <div className="empty-state">
              <p>当前还没有片段规则，点击“添加片段”开始配置。</p>
            </div>
          ) : (
            <div className="fragments-list">
              {fragments.map((fragment, index) => (
                <div key={index} className="fragment-item">
                  <div className="fragment-header">
                    <span className="fragment-order">#{index + 1}</span>
                    <div className="fragment-actions">
                      <button
                        type="button"
                        className="btn-icon-sm"
                        onClick={() => handleMoveFragment(index, 'up')}
                        disabled={index === 0}
                        title="上移"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn-icon-sm"
                        onClick={() => handleMoveFragment(index, 'down')}
                        disabled={index === fragments.length - 1}
                        title="下移"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="btn-icon-sm btn-danger"
                        onClick={() => handleRemoveFragment(index)}
                        title="删除"
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  <div className="fragment-fields">
                    <div className="form-group">
                      <label>文件匹配标识 *</label>
                      <input
                        type="text"
                        className="form-control"
                        value={fragment.filePattern}
                        onChange={(e) => handleFragmentChange(index, 'filePattern', e.target.value)}
                        required
                        placeholder="例如：pETUpstream"
                      />
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={Boolean(fragment.reverseComplement)}
                          onChange={(e) => handleFragmentChange(index, 'reverseComplement', e.target.checked)}
                        />
                        先按起止序列截取，再反向互补
                      </label>
                    </div>

                    <div className="form-group">
                      <label>起始序列</label>
                      <input
                        type="text"
                        className="form-control"
                        value={fragment.startSequence || ''}
                        onChange={(e) =>
                          handleFragmentChange(index, 'startSequence', e.target.value.toUpperCase())
                        }
                        placeholder="例如：ATGAAA"
                      />
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={fragment.includeStart}
                          onChange={(e) => handleFragmentChange(index, 'includeStart', e.target.checked)}
                        />
                        提取结果中包含起始序列
                      </label>
                    </div>

                    <div className="form-group">
                      <label>结束序列</label>
                      <input
                        type="text"
                        className="form-control"
                        value={fragment.endSequence || ''}
                        onChange={(e) =>
                          handleFragmentChange(index, 'endSequence', e.target.value.toUpperCase())
                        }
                        placeholder="例如：ATGTTC"
                      />
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={fragment.includeEnd}
                          onChange={(e) => handleFragmentChange(index, 'includeEnd', e.target.checked)}
                        />
                        提取结果中包含结束序列
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            取消
          </button>
          <button type="submit" className="btn btn-primary">
            保存规则
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * 规则列表与规则管理入口。
 */
export function RuleList() {
  const { state, dispatch } = useAppContext();
  const [editingRule, setEditingRule] = useState<MergeRule | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  useEffect(() => {
    const loadRules = async () => {
      try {
        if (!window.electronAPI) {
          console.error('electronAPI is not available');
          return;
        }

        const rules = await window.electronAPI.getRules();
        dispatch({ type: 'SET_RULES', payload: rules });
      } catch (error) {
        dispatch({
          type: 'ADD_LOG',
          payload: {
            timestamp: new Date(),
            level: 'error',
            message: `加载规则失败: ${(error as Error).message}`,
          },
        });
      }
    };

    void loadRules();
  }, [dispatch]);

  const handleNewRule = () => {
    setEditingRule(null);
    setShowEditor(true);
  };

  const handleEditRule = (rule: MergeRule) => {
    setEditingRule(rule);
    setShowEditor(true);
  };

  const handleSaveRule = async (rule: MergeRule) => {
    try {
      if (!window.electronAPI) {
        alert('系统初始化中，请稍后再试...');
        return;
      }

      const savedRule = await window.electronAPI.saveRule(rule);

      if (rule.id) {
        dispatch({ type: 'UPDATE_RULE', payload: savedRule });
      } else {
        dispatch({ type: 'ADD_RULE', payload: savedRule });
      }

      dispatch({
        type: 'ADD_LOG',
        payload: {
          timestamp: new Date(),
          level: 'info',
          message: `规则“${savedRule.name}”保存成功`,
        },
      });

      setShowEditor(false);
      setEditingRule(null);
    } catch (error) {
      const errorMsg = (error as Error).message;
      let userMessage = `保存规则失败: ${errorMsg}`;

      if (errorMsg.includes('UNIQUE constraint failed') || errorMsg.includes('unique')) {
        userMessage = '保存失败：规则名称已存在，请更换一个名称。';
      } else if (errorMsg.includes('database is locked')) {
        userMessage = '保存失败：数据库当前正被占用，请稍后再试。';
      }

      dispatch({
        type: 'ADD_LOG',
        payload: {
          timestamp: new Date(),
          level: 'error',
          message: userMessage,
        },
      });

      alert(userMessage);
    }
  };

  const handleDeleteRule = async (rule: MergeRule) => {
    if (!rule.id) {
      return;
    }

    if (!confirm(`确认删除规则“${rule.name}”吗？`)) {
      return;
    }

    try {
      if (!window.electronAPI) {
        alert('系统初始化中，请稍后再试...');
        return;
      }

      await window.electronAPI.deleteRule(rule.id);
      dispatch({ type: 'DELETE_RULE', payload: rule.id });

      dispatch({
        type: 'ADD_LOG',
        payload: {
          timestamp: new Date(),
          level: 'info',
          message: `规则“${rule.name}”已删除`,
        },
      });
    } catch (error) {
      const errorMsg = (error as Error).message;
      let userMessage = `删除规则失败: ${errorMsg}`;

      if (errorMsg.includes('not found')) {
        userMessage = '删除失败：该规则不存在或已经被删除。';
      } else if (errorMsg.includes('database is locked')) {
        userMessage = '删除失败：数据库当前正被占用，请稍后再试。';
      }

      dispatch({
        type: 'ADD_LOG',
        payload: {
          timestamp: new Date(),
          level: 'error',
          message: userMessage,
        },
      });

      alert(userMessage);
    }
  };

  const handleSelectRule = (rule: MergeRule) => {
    dispatch({ type: 'SELECT_RULE', payload: rule });
  };

  const handleCancelEdit = () => {
    setShowEditor(false);
    setEditingRule(null);
  };

  if (showEditor) {
    return (
      <div className="rule-manager">
        <RuleEditor rule={editingRule} onSave={handleSaveRule} onCancel={handleCancelEdit} />
      </div>
    );
  }

  return (
    <div className="rule-manager">
      <div className="rule-manager-header">
        <h2>拼接规则</h2>
        <button className="btn btn-primary" onClick={handleNewRule}>
          + 新建规则
        </button>
      </div>

      {state.rules.length === 0 ? (
        <div className="empty-state">
          <p>当前还没有拼接规则</p>
          <button className="btn btn-primary" onClick={handleNewRule}>
            创建第一条规则
          </button>
        </div>
      ) : (
        <div className="rules-list">
          {state.rules.map((rule) => (
            <div
              key={rule.id}
              className={`rule-card ${state.selectedRule?.id === rule.id ? 'selected' : ''}`}
              onClick={() => handleSelectRule(rule)}
            >
              <div className="rule-card-header">
                <h3>{rule.name}</h3>
                <div className="rule-card-actions">
                  <button
                    className="btn-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditRule(rule);
                    }}
                    title="编辑"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  </button>
                  <button
                    className="btn-icon btn-danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteRule(rule);
                    }}
                    title="删除"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </div>
              {rule.description && <p className="rule-card-description">{rule.description}</p>}
              <div className="rule-card-info">
                <span className="rule-card-fragments">{rule.fragments.length} 个片段</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
