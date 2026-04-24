import { useEffect, useRef } from 'react';
import type { LogEntry } from '../../shared/types';
import { useAppContext } from '../context/AppContext';
import { VirtualList } from './VirtualList';

export function LogViewer() {
  const { state } = useAppContext();
  const logEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (logEndRef.current && containerRef.current) {
      const container = containerRef.current;
      const isScrolledToBottom =
        container.scrollHeight - container.scrollTop <= container.clientHeight + 50;

      // 只有当用户已经在底部附近时才自动滚动
      if (isScrolledToBottom) {
        logEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [state.logs]);

  const formatTime = (date: Date) => {
    const d = new Date(date);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };

  const getLogIcon = (level: LogEntry['level']) => {
    switch (level) {
      case 'info':
        return (
          <svg className="log-icon log-icon-info" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'warning':
        return (
          <svg className="log-icon log-icon-warning" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      case 'error':
        return (
          <svg className="log-icon log-icon-error" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  const latestLog = state.logs[state.logs.length - 1];

  return (
    <div className="log-viewer">
      <div className="log-viewer-header">
        <h2>处理日志</h2>
        <div className="log-stats">
          <span className="log-stat">
            <span className="log-stat-label">总计:</span>
            <span className="log-stat-value">{state.logs.length}</span>
          </span>
          <span className="log-stat">
            <span className="log-stat-label">错误:</span>
            <span className="log-stat-value log-stat-error">
              {state.logs.filter(log => log.level === 'error').length}
            </span>
          </span>
          <span className="log-stat">
            <span className="log-stat-label">警告:</span>
            <span className="log-stat-value log-stat-warning">
              {state.logs.filter(log => log.level === 'warning').length}
            </span>
          </span>
        </div>
      </div>

      {latestLog && (
        <div className="log-latest">
          <span className="log-latest-label">最新</span>
          <span className="log-latest-message">{latestLog.message}</span>
        </div>
      )}

      <div className="log-viewer-content" ref={containerRef}>
        {state.logs.length === 0 ? (
          <div className="log-empty">
            <svg className="log-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p>暂无日志</p>
          </div>
        ) : state.logs.length > 100 ? (
          // 日志数量较多时使用虚拟滚动
          <VirtualList
            items={state.logs}
            itemHeight={80} // 每条日志的估计高度
            containerHeight={400} // 容器高度
            renderItem={(log, index) => (
              <div key={index} className={`log-entry log-entry-${log.level}`}>
                <div className="log-entry-icon">
                  {getLogIcon(log.level)}
                </div>
                <div className="log-entry-content">
                  <div className="log-entry-header">
                    <span className="log-entry-time">{formatTime(log.timestamp)}</span>
                    <span className={`log-entry-level log-level-${log.level}`}>
                      {log.level.toUpperCase()}
                    </span>
                  </div>
                  <div className="log-entry-message">{log.message}</div>
                </div>
              </div>
            )}
          />
        ) : (
          // 日志数量较少时直接渲染
          <div className="log-entries">
            {state.logs.map((log, index) => (
              <div key={index} className={`log-entry log-entry-${log.level}`}>
                <div className="log-entry-icon">
                  {getLogIcon(log.level)}
                </div>
                <div className="log-entry-content">
                  <div className="log-entry-header">
                    <span className="log-entry-time">{formatTime(log.timestamp)}</span>
                    <span className={`log-entry-level log-level-${log.level}`}>
                      {log.level.toUpperCase()}
                    </span>
                  </div>
                  <div className="log-entry-message">{log.message}</div>
                </div>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
