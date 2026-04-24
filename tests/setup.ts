// Jest测试环境设置文件

// 设置测试超时时间
jest.setTimeout(10000);

// 全局测试钩子
beforeAll(() => {
  // 全局测试前的设置
});

afterAll(() => {
  // 全局测试后的清理
});

// 每个测试前的设置
beforeEach(() => {
  // 清理模拟和间谍
  jest.clearAllMocks();
});

// 每个测试后的清理
afterEach(() => {
  // 清理
});
