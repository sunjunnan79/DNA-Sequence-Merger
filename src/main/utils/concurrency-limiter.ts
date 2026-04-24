/**
 * 并发限制器 - 限制同时执行的异步任务数量
 */
export class ConcurrencyLimiter {
  private queue: Array<() => Promise<void>> = [];
  private running = 0;

  constructor(private limit: number) {}

  /**
   * 执行任务，如果达到并发限制则排队等待
   * @param task 要执行的异步任务
   * @returns 任务结果
   */
  async run<T>(task: () => Promise<T>): Promise<T> {
    while (this.running >= this.limit) {
      await new Promise<void>(resolve => this.queue.push(() => Promise.resolve(resolve())));
    }

    this.running++;

    try {
      return await task();
    } finally {
      this.running--;
      const next = this.queue.shift();
      if (next) {
        next();
      }
    }
  }

  /**
   * 并行执行多个任务，限制并发数量
   * @param tasks 任务数组
   * @returns 所有任务的结果数组
   */
  async runAll<T>(tasks: Array<() => Promise<T>>): Promise<T[]> {
    return Promise.all(tasks.map(task => this.run(task)));
  }
}
