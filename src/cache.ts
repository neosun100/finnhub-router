/**
 * Cache: URL 级别短期缓存，避免同一 symbol 重复请求 Finnhub
 * 使用内存 Map（Cloudflare Worker 单次请求生命周期内有效，跨请求靠 Cache API）
 */

interface CacheEntry {
  body: string;
  headers: Record<string, string>;
  status: number;
  expires: number;
}

export class ResponseCache {
  private store = new Map<string, CacheEntry>();
  private ttlMs: number;

  constructor(ttlSeconds = 30) {
    this.ttlMs = ttlSeconds * 1000;
  }

  /** 生成缓存 key：去掉 token 参数，只按 path + 业务参数缓存 */
  static cacheKey(url: URL): string {
    const params = new URLSearchParams(url.search);
    params.delete('token'); // 去掉认证参数
    const qs = params.toString();
    return url.pathname + (qs ? '?' + qs : '');
  }

  get(key: string): CacheEntry | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      this.store.delete(key);
      return null;
    }
    return entry;
  }

  set(key: string, body: string, status: number, headers: Record<string, string>) {
    this.store.set(key, {
      body,
      headers,
      status,
      expires: Date.now() + this.ttlMs,
    });
    // 简单 LRU：超过 1000 条时清理最早的
    if (this.store.size > 1000) {
      const first = this.store.keys().next().value;
      if (first) this.store.delete(first);
    }
  }

  get size() { return this.store.size; }
}
