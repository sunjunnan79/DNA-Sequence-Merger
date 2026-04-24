import { useEffect } from 'react';
import { AppProvider, useAppContext } from './context/AppContext';
import { FileImport } from './components/FileImport';
import { RuleList } from './components/RuleEditor';
import { ProcessPanel } from './components/ProcessPanel';
import { LogViewer } from './components/LogViewer';
import './styles/main.css';

/**
 * 应用主体内容。
 *
 * 这里在首屏加载后主动读取本地规则列表，避免用户每次启动应用后还需要先手动触发一次刷新。
 */
function AppContent() {
  const { dispatch } = useAppContext();

  useEffect(() => {
    const loadRules = async () => {
      try {
        if (!window.electronAPI) {
          console.error('electronAPI is not available');
          return;
        }

        const rules = await window.electronAPI.getRules();
        dispatch({ type: 'SET_RULES', payload: rules });
        dispatch({
          type: 'ADD_LOG',
          payload: {
            timestamp: new Date(),
            level: 'info',
            message: `已加载 ${rules.length} 条拼接规则`,
          },
        });
      } catch (error) {
        console.error('Failed to load rules:', error);
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

  return (
    <div className="app">
      <header className="app-header">
        <h1>DNA 序列拼接文档生成工具</h1>
      </header>

      <main className="app-main">
        <div className="app-layout">
          <div className="app-sidebar">
            <div className="sidebar-section">
              <FileImport />
            </div>
            <div className="sidebar-section">
              <RuleList />
            </div>
          </div>

          <div className="app-content">
            <div className="content-section">
              <ProcessPanel />
            </div>
            <div className="content-section content-section-logs">
              <LogViewer />
            </div>
          </div>
        </div>
      </main>

      <footer className="app-footer">
        <p>DNA Sequence Merger v1.0.0</p>
      </footer>
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
