import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { VirtualList } from './VirtualList';

/**
 * 文件导入面板。
 *
 * 支持三种入口：
 * 1. 拖拽目录或压缩包
 * 2. 手动选择目录
 * 3. 手动选择压缩包
 *
 * 导入完成后会顺手把默认输出路径也推导出来，减少用户额外填写步骤。
 */
export function FileImport() {
  const { state, dispatch } = useAppContext();
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) {
      return;
    }

    const file = files[0] as File & { path: string };
    await handleFileOrDirectory(file.path);
  };

  /**
   * 统一处理目录和压缩包导入逻辑。
   *
   * 这样拖拽、按钮选择目录、按钮选择压缩包都能共用同一套业务流程。
   */
  const handleFileOrDirectory = async (targetPath: string) => {
    try {
      dispatch({
        type: 'ADD_LOG',
        payload: {
          timestamp: new Date(),
          level: 'info',
          message: `开始扫描: ${targetPath}`,
        },
      });

      const groups = await window.electronAPI.scanFiles(targetPath);
      dispatch({ type: 'SET_FILES', payload: groups });
      dispatch({ type: 'SET_SOURCE_PATH', payload: targetPath });

      // 对压缩包做一次后缀替换；对于目录则直接在路径后补一个结果文件名。
      const defaultOutputPath = targetPath.match(/\.(zip|rar|7z)$/i)
        ? targetPath.replace(/\.(zip|rar|7z)$/i, '_结果.docx')
        : `${targetPath.replace(/[\\/]+$/, '')}_结果.docx`;

      dispatch({ type: 'SET_OUTPUT_PATH', payload: defaultOutputPath });

      dispatch({
        type: 'ADD_LOG',
        payload: {
          timestamp: new Date(),
          level: 'info',
          message: `成功导入 ${groups.length} 个文件组`,
        },
      });

      dispatch({
        type: 'ADD_LOG',
        payload: {
          timestamp: new Date(),
          level: 'info',
          message: `输出路径已自动设置为: ${defaultOutputPath}`,
        },
      });
    } catch (error) {
      dispatch({
        type: 'ADD_LOG',
        payload: {
          timestamp: new Date(),
          level: 'error',
          message: `导入失败: ${(error as Error).message}`,
        },
      });
    }
  };

  const handleSelectDirectory = async () => {
    try {
      if (!window.electronAPI) {
        alert('系统初始化中，请稍后再试...');
        return;
      }

      const targetPath = await window.electronAPI.selectDirectory();
      if (targetPath) {
        await handleFileOrDirectory(targetPath);
      }
    } catch (error) {
      dispatch({
        type: 'ADD_LOG',
        payload: {
          timestamp: new Date(),
          level: 'error',
          message: `选择文件夹失败: ${(error as Error).message}`,
        },
      });
    }
  };

  const handleSelectArchive = async () => {
    try {
      if (!window.electronAPI) {
        alert('系统初始化中，请稍后再试...');
        return;
      }

      const targetPath = await window.electronAPI.selectArchive();
      if (targetPath) {
        await handleFileOrDirectory(targetPath);
      }
    } catch (error) {
      dispatch({
        type: 'ADD_LOG',
        payload: {
          timestamp: new Date(),
          level: 'error',
          message: `选择压缩包失败: ${(error as Error).message}`,
        },
      });
    }
  };

  const totalFiles = state.files.reduce((sum, group) => sum + group.files.length, 0);
  const incompleteGroups = state.files.filter((group) => !group.isComplete).length;

  return (
    <div className="file-import">
      <h2>文件导入</h2>

      <div
        className={`drop-zone ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="drop-zone-content">
          <svg className="drop-zone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <p className="drop-zone-text">拖拽文件夹或压缩包到这里</p>
          <p className="drop-zone-subtext">支持 .zip、.rar、.7z</p>
        </div>
      </div>

      <div className="file-import-buttons">
        <button className="btn btn-primary" onClick={handleSelectDirectory}>
          <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
          选择文件夹
        </button>
        <button className="btn btn-secondary" onClick={handleSelectArchive}>
          <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
          选择压缩包
        </button>
      </div>

      {state.files.length > 0 && (
        <div className="file-groups">
          <div className="file-groups-header">
            <h3>已导入文件组（{state.files.length}）</h3>
            <div className="file-summary">
              <span>文件 {totalFiles}</span>
              <span>完整 {state.files.length - incompleteGroups}</span>
              <span>待补全 {incompleteGroups}</span>
            </div>
          </div>

          {state.files.length > 20 ? (
            <VirtualList
              items={state.files}
              itemHeight={120}
              containerHeight={400}
              renderItem={(group, index) => (
                <div key={index} className="file-group">
                  <div className="file-group-header">
                    <span className="file-group-name">{group.groupName}</span>
                    {!group.isComplete && <span className="badge badge-warning">不完整</span>}
                  </div>
                  <div className="file-group-files">
                    {group.files.map((file, fileIndex) => (
                      <div key={fileIndex} className="file-item">
                        <span className="file-name" title={file.filename}>
                          {file.filename}
                        </span>
                      </div>
                    ))}
                  </div>
                  {group.missingPatterns.length > 0 && (
                    <div className="file-group-warning">
                      <svg className="warning-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                      <span>缺少文件: {group.missingPatterns.join(', ')}</span>
                    </div>
                  )}
                </div>
              )}
            />
          ) : (
            state.files.map((group, index) => (
              <div key={index} className="file-group">
                <div className="file-group-header">
                  <span className="file-group-name">{group.groupName}</span>
                  {!group.isComplete && <span className="badge badge-warning">不完整</span>}
                </div>
                <div className="file-group-files">
                  {group.files.map((file, fileIndex) => (
                    <div key={fileIndex} className="file-item">
                      <span className="file-name" title={file.filename}>
                        {file.filename}
                      </span>
                    </div>
                  ))}
                </div>
                {group.missingPatterns.length > 0 && (
                  <div className="file-group-warning">
                    <svg className="warning-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                    <span>缺少文件: {group.missingPatterns.join(', ')}</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
