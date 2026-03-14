/**
 * finnhub-router: Finnhub API 智能反代
 * - 多 Key 轮换（50 keys, round-robin）
 * - Per-key 60 req/min 限流
 * - 故障自动切换
 * - 同 URL 短期缓存（可配置 TTL）
 * - 透明反代，API 格式与 Finnhub 完全一致
 */

import { Hono } from 'hono';
import { KeyPool } from './key-pool';
import { ResponseCache } from './cache';
import { proxyToFinnhub } from './proxy';

type Env = {
  FINNHUB_KEYS: string;   // 逗号分隔的 API keys
  CACHE_TTL?: string;      // 缓存 TTL 秒数，默认 30
  AUTH_TOKEN?: string;     // 可选：访问本 router 的认证 token
};

const app = new Hono<{ Bindings: Env }>();

// 单例（Worker 实例级别，跨请求复用）
let keyPool: KeyPool | null = null;
let cache: ResponseCache | null = null;

// In Node.js mode, c.env is empty — fall back to process.env
function getEnv(env: Env): Env {
  return {
    FINNHUB_KEYS: env.FINNHUB_KEYS || process.env.FINNHUB_KEYS || '',
    CACHE_TTL: env.CACHE_TTL || process.env.CACHE_TTL,
    AUTH_TOKEN: env.AUTH_TOKEN || process.env.AUTH_TOKEN,
  };
}

function getKeyPool(env: Env): KeyPool {
  const e = getEnv(env);
  if (!keyPool) {
    const keys = e.FINNHUB_KEYS.split(',').map(k => k.trim()).filter(Boolean);
    keyPool = new KeyPool(keys);
  }
  return keyPool;
}

function getCache(env: Env): ResponseCache {
  const e = getEnv(env);
  if (!cache) {
    cache = new ResponseCache(parseInt(e.CACHE_TTL || '30', 10));
  }
  return cache;
}

// --- 中间件：认证（兼容 Finnhub 原生两种方式） ---
// 1. Header: X-Finnhub-Token: <router_token>
// 2. Query:  ?token=<router_token>
// 3. Header: Authorization: Bearer <router_token>  (额外支持)
app.use('/api/*', async (c, next) => {
  const authToken = getEnv(c.env).AUTH_TOKEN;
  if (authToken) {
    const provided =
      c.req.header('X-Finnhub-Token')
      || c.req.query('token')
      || c.req.header('Authorization')?.replace('Bearer ', '');
    if (provided !== authToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
  }
  await next();
});

// --- 健康检查 ---
app.get('/', (c) => c.json({ service: 'finnhub-router', status: 'ok' }));

// --- Key 池状态（管理端点） ---
app.get('/admin/stats', (c) => {
  const pool = getKeyPool(c.env);
  return c.json({
    totalKeys: pool.size,
    keys: pool.stats(),
    cacheSize: getCache(c.env).size,
  });
});

// --- 核心：透明反代所有 /api/v1/* 请求 ---
app.all('/api/v1/*', async (c) => {
  const pool = getKeyPool(c.env);
  const rc = getCache(c.env);
  const url = new URL(c.req.url);

  // GET 请求走缓存
  if (c.req.method === 'GET') {
    const ck = ResponseCache.cacheKey(url);
    const hit = rc.get(ck);
    if (hit) {
      return new Response(hit.body, {
        status: hit.status,
        headers: { ...hit.headers, 'X-Cache': 'HIT' },
      });
    }

    const { response, key } = await proxyToFinnhub(c.req.raw, pool);

    // 只缓存成功响应
    if (response.status === 200) {
      const body = await response.text();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      rc.set(ck, body, response.status, headers);
      return new Response(body, {
        status: 200,
        headers: { ...headers, 'X-Cache': 'MISS', 'X-Key': key.slice(0, 6) + '...' },
      });
    }

    return response;
  }

  // 非 GET 直接代理
  const { response } = await proxyToFinnhub(c.req.raw, pool);
  return response;
});

export default app;
