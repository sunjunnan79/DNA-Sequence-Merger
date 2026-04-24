import { useEffect, useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import type { ProcessOptions, DocumentOptions, ProcessProgress } from '../../shared/types';

/**
 * 处理与生成面板。
 *
 * 这个组件负责把“当前已导入的文件组 + 选中的规则 + 输出路径”串起来，
 * 并驱动主进程完成序列处理与文档生成。
 */
export function ProcessPanel() {
  const { state, dispatch } = useAppContext();
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const lastProgressLogRef = useRef<string>('');

  useEffect(() => {
    if (!window.electronAPI?.onProcessProgress) {
      return;
    }

    const unsubscribe = window.electronAPI.onProcessProgress((progress: ProcessProgress) => {
      dispatch({ type: 'SET_PROCESS_PROGRESS', payload: progress });

      if (!progress.message) {
        return;
      }

      const logKey = `${progress.logLevel || 'info'}:${progress.message}`;
      if (lastProgressLogRef.current === logKey) {
        return;
      }
      lastProgressLogRef.current = logKey;

      dispatch({
        type: 'ADD_LOG',
        payload: {
          timestamp: new Date(),
          level: progress.logLevel || 'info',
          message: progress.message,
        },
      });
    });

    return () => {
      unsubscribe();
    };
  }, [dispatch]);

  /**
   * 在真正开始处理前，先做一轮表单级校验。
   * 这样可以把常见问题尽量挡在渲染层，避免无意义地触发主进程任务。
   */
  const validateInputs = (): string[] => {
    const errors: string[] = [];

    if (state.files.length === 0) {
      errors.push('请先导入待处理的文件');
    }

    if (state.selectedRule === null) {
      errors.push('请选择一个拼接规则');
    }

    if (state.outputPath.trim() === '') {
      errors.push('请填写输出文档路径');
    }

    return errors;
  };

  const canProcess =
    state.files.length > 0 &&
    state.selectedRule !== null &&
    !state.processing &&
    state.outputPath.trim() !== '';

  /**
   * 选择输出目录后，自动生成一个带时间戳的 docx 文件路径。
   */
  const handleSelectOutputPath = async () => {
    try {
      if (!window.electronAPI) {
        alert('系统初始化中，请稍后再试...');
        return;
      }

      const directory = await window.electronAPI.selectDirectory();
      if (!directory) {
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fullPath = `${directory}/DNA_Results_${timestamp}.docx`;
      dispatch({ type: 'SET_OUTPUT_PATH', payload: fullPath });

      setValidationErrors((prev) => prev.filter((error) => !error.includes('输出文档路径')));
    } catch (error) {
      const errorMsg = `选择输出路径失败: ${(error as Error).message}`;
      dispatch({
        type: 'ADD_LOG',
        payload: {
          timestamp: new Date(),
          level: 'error',
          message: errorMsg,
        },
      });
      alert(errorMsg);
    }
  };

  /**
   * 驱动完整主链路：
   * 1. 主进程进行分组拼接与翻译
   * 2. 使用处理结果生成 Word 文档
   * 3. 清理解压临时目录
   */
  const handleProcess = async () => {
    const errors = validateInputs();
    if (errors.length > 0) {
      setValidationErrors(errors);
      alert(`请完成以下必填项：\n\n${errors.map((error) => `• ${error}`).join('\n')}`);
      return;
    }

    if (!state.selectedRule) {
      return;
    }

    if (!window.electronAPI) {
      alert('系统初始化中，请稍后再试...');
      return;
    }

    setValidationErrors([]);
    lastProgressLogRef.current = '';
    dispatch({ type: 'START_PROCESSING' });
    dispatch({
      type: 'ADD_LOG',
      payload: {
        timestamp: new Date(),
        level: 'info',
        message: '开始处理序列...',
      },
    });

    try {
      const allFiles = state.files.flatMap((group) => group.files);
      const processOptions: ProcessOptions = {
        rule: state.selectedRule,
        files: allFiles,
      };

      dispatch({
        type: 'ADD_LOG',
        payload: {
          timestamp: new Date(),
          level: 'info',
          message: `使用规则“${state.selectedRule.name}”处理 ${state.files.length} 个文件组...`,
        },
      });

      const results = await window.electronAPI.processSequences(processOptions);

      dispatch({
        type: 'ADD_LOG',
        payload: {
          timestamp: new Date(),
          level: 'info',
          message: `序列处理阶段结束，共得到 ${results.length} 个结果`,
        },
      });

      const documentOptions: DocumentOptions = {
        outputPath: state.outputPath,
        results,
        blastResults: new Map(),
        subjectSequence: state.selectedRule.subjectSequence || '',
      };

      const docPath = await window.electronAPI.generateDocument(documentOptions);

      dispatch({
        type: 'ADD_LOG',
        payload: {
          timestamp: new Date(),
          level: 'info',
          message: `文档生成成功: ${docPath}`,
        },
      });

      dispatch({ type: 'COMPLETE_PROCESSING' });

      try {
        await window.electronAPI.cleanupTemp();
      } catch (cleanupError) {
        dispatch({
          type: 'ADD_LOG',
          payload: {
            timestamp: new Date(),
            level: 'warning',
            message: `清理临时文件失败: ${(cleanupError as Error).message}`,
          },
        });
      }

      alert(`处理完成！\n文档已保存到: ${docPath}`);
    } catch (error) {
      const errorMsg = (error as Error).message;
      dispatch({
        type: 'ADD_LOG',
        payload: {
          timestamp: new Date(),
          level: 'error',
          message: `处理失败: ${errorMsg}`,
        },
      });
      dispatch({
        type: 'SET_PROCESS_PROGRESS',
        payload: {
          ...state.processProgress,
          stage: 'error',
          progress: 100,
          message: `处理失败: ${errorMsg}`,
          logLevel: 'error',
        },
      });
      dispatch({ type: 'COMPLETE_PROCESSING' });

      let userMessage = `处理失败: ${errorMsg}`;

      if (errorMsg.includes('network') || errorMsg.includes('Network')) {
        userMessage += '\n\n提示：请检查网络连接或 BLAST 服务是否可用。';
      } else if (errorMsg.includes('Permission denied') || errorMsg.includes('EACCES')) {
        userMessage += '\n\n提示：请确认当前目录可读写。';
      } else if (errorMsg.includes('does not exist') || errorMsg.includes('ENOENT')) {
        userMessage += '\n\n提示：请确认源文件或输出目录仍然存在。';
      }

      alert(userMessage);
    }
  };

  const stageLabels: Record<ProcessProgress['stage'], string> = {
    idle: '等待开始',
    preparing: '准备中',
    'processing-groups': '解析序列',
    'processing-complete': '序列完成',
    'blast-comparing': 'BLAST 对比',
    'generating-document': '生成文档',
    completed: '已完成',
    error: '失败',
  };

  const progressDetail = state.processProgress;
  const hasProgressCounts = typeof progressDetail.total === 'number' && progressDetail.total > 0;

  return (
    <div className="process-panel">
      <h2>处理与导出</h2>

      <div className="process-info">
        <div className="info-item">
          <label>当前规则:</label>
          <span className={state.selectedRule ? 'text-success' : 'text-muted'}>
            {state.selectedRule ? state.selectedRule.name : '未选择'}
          </span>
        </div>
        <div className="info-item">
          <label>文件组数量:</label>
          <span className={state.files.length > 0 ? 'text-success' : 'text-muted'}>
            {state.files.length}
          </span>
        </div>
        {state.selectedRule?.subjectSequence && (
          <div className="info-item">
            <label>BLAST 目标序列:</label>
            <span className="text-success">已配置</span>
          </div>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="output-path">输出文档路径 *</label>
        <div className="input-group">
          <input
            id="output-path"
            type="text"
            className="form-control"
            value={state.outputPath}
            onChange={(e) => {
              dispatch({ type: 'SET_OUTPUT_PATH', payload: e.target.value });
            }}
            placeholder="请输入或选择一个 .docx 输出路径"
            disabled={state.processing}
          />
          <button className="btn btn-secondary" onClick={handleSelectOutputPath} disabled={state.processing}>
            选择...
          </button>
        </div>
        <small className="form-text">建议选择一个你有写入权限的位置，处理完成后会直接生成 Word 文档。</small>
      </div>

      {state.processing && (
        <div className="progress-container">
          <div className="progress-header">
            <div>
              <div className="progress-stage">{stageLabels[progressDetail.stage]}</div>
              <div className="progress-message">{progressDetail.message}</div>
            </div>
            <div className="progress-text">{state.progress}%</div>
          </div>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${state.progress}%` }} />
          </div>
          <div className="progress-meta">
            {hasProgressCounts && (
              <span>
                进度 {progressDetail.current ?? 0}/{progressDetail.total}
              </span>
            )}
            <span>成功 {progressDetail.successCount ?? 0}</span>
            <span>异常 {progressDetail.failureCount ?? 0}</span>
            <span>警告 {progressDetail.warningCount ?? 0}</span>
            {progressDetail.groupName && <span>当前 {progressDetail.groupName}</span>}
          </div>
        </div>
      )}

      <div className="process-actions">
        <button
          className="btn btn-primary btn-lg"
          onClick={handleProcess}
          disabled={!canProcess}
          title={!canProcess ? '请先完成文件导入、规则选择和输出路径设置' : ''}
        >
          {state.processing ? (
            <>
              <span className="spinner"></span>
              处理中...
            </>
          ) : (
            <>
              <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              开始处理
            </>
          )}
        </button>
      </div>

      {!canProcess && !state.processing && (
        <div className="process-hints">
          <p className="hint-title">开始处理前需要：</p>
          <ul>
            {state.files.length === 0 && <li className="hint-error">× 已导入文件</li>}
            {state.selectedRule === null && <li className="hint-error">× 已选择拼接规则</li>}
            {state.outputPath.trim() === '' && <li className="hint-error">× 输出路径已设置</li>}
          </ul>
        </div>
      )}

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
    </div>
  );
}
