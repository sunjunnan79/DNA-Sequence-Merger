import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import type { FileGroup, MergeRule, LogEntry, ProcessProgress } from '../../shared/types';

// 应用状态类型
export interface AppState {
  files: FileGroup[];
  rules: MergeRule[];
  selectedRule: MergeRule | null;
  sourcePath: string;  // 导入的源路径（文件夹或压缩包）
  outputPath: string;
  processing: boolean;
  progress: number;
  processProgress: ProcessProgress;
  logs: LogEntry[];
}

// 应用动作类型
export type AppAction =
  | { type: 'SET_FILES'; payload: FileGroup[] }
  | { type: 'SET_SOURCE_PATH'; payload: string }
  | { type: 'SET_RULES'; payload: MergeRule[] }
  | { type: 'SELECT_RULE'; payload: MergeRule | null }
  | { type: 'SET_OUTPUT_PATH'; payload: string }
  | { type: 'START_PROCESSING' }
  | { type: 'UPDATE_PROGRESS'; payload: number }
  | { type: 'SET_PROCESS_PROGRESS'; payload: ProcessProgress }
  | { type: 'ADD_LOG'; payload: LogEntry }
  | { type: 'COMPLETE_PROCESSING' }
  | { type: 'ADD_RULE'; payload: MergeRule }
  | { type: 'UPDATE_RULE'; payload: MergeRule }
  | { type: 'DELETE_RULE'; payload: number };

// 初始状态
const initialState: AppState = {
  files: [],
  rules: [],
  selectedRule: null,
  sourcePath: '',
  outputPath: '',
  processing: false,
  progress: 0,
  processProgress: {
    stage: 'idle',
    progress: 0,
    message: '等待开始',
    current: 0,
    total: 0,
    successCount: 0,
    failureCount: 0,
    warningCount: 0,
  },
  logs: [],
};

// Reducer函数
export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_FILES':
      return { ...state, files: action.payload };
    
    case 'SET_SOURCE_PATH':
      return { ...state, sourcePath: action.payload };
    
    case 'SET_RULES':
      return { ...state, rules: action.payload };
    
    case 'SELECT_RULE':
      return { ...state, selectedRule: action.payload };
    
    case 'SET_OUTPUT_PATH':
      return { ...state, outputPath: action.payload };
    
    case 'START_PROCESSING':
      return {
        ...state,
        processing: true,
        progress: 0,
        processProgress: {
          stage: 'preparing',
          progress: 0,
          message: '准备开始处理...',
          current: 0,
          total: state.files.length,
          successCount: 0,
          failureCount: 0,
          warningCount: 0,
        },
      };

    case 'UPDATE_PROGRESS':
      return {
        ...state,
        progress: action.payload,
        processProgress: {
          ...state.processProgress,
          progress: action.payload,
        },
      };

    case 'SET_PROCESS_PROGRESS':
      return {
        ...state,
        progress: action.payload.progress,
        processProgress: action.payload,
      };
    
    case 'ADD_LOG':
      return { ...state, logs: [...state.logs, action.payload] };
    
    case 'COMPLETE_PROCESSING':
      return {
        ...state,
        processing: false,
        progress: 100,
        processProgress: {
          ...state.processProgress,
          stage: state.processProgress.stage === 'error' ? 'error' : 'completed',
          progress: 100,
          message:
            state.processProgress.stage === 'error'
              ? state.processProgress.message
              : state.processProgress.message || '处理完成',
        },
      };
    
    case 'ADD_RULE':
      return { ...state, rules: [...state.rules, action.payload] };
    
    case 'UPDATE_RULE':
      return {
        ...state,
        rules: state.rules.map(rule =>
          rule.id === action.payload.id ? action.payload : rule
        ),
        selectedRule: state.selectedRule?.id === action.payload.id
          ? action.payload
          : state.selectedRule,
      };
    
    case 'DELETE_RULE':
      return {
        ...state,
        rules: state.rules.filter(rule => rule.id !== action.payload),
        selectedRule: state.selectedRule?.id === action.payload
          ? null
          : state.selectedRule,
      };
    
    default:
      return state;
  }
}

// Context类型
interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

// 创建Context
const AppContext = createContext<AppContextType | undefined>(undefined);

// Provider组件
interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

// 自定义Hook
export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}
