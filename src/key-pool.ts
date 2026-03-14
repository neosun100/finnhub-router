/**
 * KeyPool: 多 Key 轮换 + per-key 60 req/min 限流 + 健康检测 + 故障切换
 *
 * 算法：
 * - Round-robin 轮换，跳过已耗尽或不健康的 key
 * - 每个 key 独立跟踪：当前分钟窗口请求数、健康状态
 * - 不健康的 key 冷却 60 秒后自动恢复探测
 */

const RATE_LIMIT = 60;          // Finnhub 免费账号 60 req/min
const WINDOW_MS = 60_000;       // 1 分钟窗口
const COOLDOWN_MS = 60_000;     // 不健康 key 冷却时间

interface KeyState {
  key: string;
  count: number;           // 当前窗口请求数
  windowStart: number;     // 当前窗口起始时间
  healthy: boolean;
  lastFailure: number;     // 上次失败时间
}

export class KeyPool {
  private keys: KeyState[];
  private cursor = 0;

  constructor(keys: string[]) {
    if (!keys.length) throw new Error('KeyPool: no keys provided');
    this.keys = keys.map(key => ({
      key,
      count: 0,
      windowStart: Date.now(),
      healthy: true,
      lastFailure: 0,
    }));
  }

  get size() { return this.keys.length; }

  /** 获取下一个可用 key，返回 null 表示全部耗尽 */
  acquire(): string | null {
    const now = Date.now();
    const n = this.keys.length;

    for (let i = 0; i < n; i++) {
      const idx = (this.cursor + i) % n;
      const s = this.keys[idx];

      // 重置过期窗口
      if (now - s.windowStart >= WINDOW_MS) {
        s.count = 0;
        s.windowStart = now;
      }

      // 不健康的 key：冷却期过后恢复探测
      if (!s.healthy) {
        if (now - s.lastFailure < COOLDOWN_MS) continue;
        s.healthy = true; // 尝试恢复
      }

      // 限流检查
      if (s.count >= RATE_LIMIT) continue;

      // 选中
      s.count++;
      this.cursor = (idx + 1) % n;
      return s.key;
    }

    return null; // 全部耗尽
  }

  /** 标记 key 请求成功 */
  reportSuccess(key: string) {
    const s = this.find(key);
    if (s) s.healthy = true;
  }

  /** 标记 key 失败（401/403/429 等） */
  reportFailure(key: string) {
    const s = this.find(key);
    if (s) {
      s.healthy = false;
      s.lastFailure = Date.now();
    }
  }

  /** 获取池状态摘要 */
  stats() {
    const now = Date.now();
    return this.keys.map(s => {
      const windowActive = now - s.windowStart < WINDOW_MS;
      return {
        key: s.key.slice(0, 6) + '...',
        used: windowActive ? s.count : 0,
        remaining: RATE_LIMIT - (windowActive ? s.count : 0),
        healthy: s.healthy,
      };
    });
  }

  private find(key: string) {
    return this.keys.find(s => s.key === key);
  }
}
