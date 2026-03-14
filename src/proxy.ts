/**
 * Proxy: 透明反代 Finnhub API
 * - 保持完全相同的 API 路径和参数格式
 * - 替换 token 参数为内部选中的 key
 * - 转发响应（status + headers + body）
 */

import { KeyPool } from './key-pool';

const FINNHUB_BASE = 'https://finnhub.io';

/** 需要标记 key 失败的 HTTP 状态码 */
const FAILURE_CODES = new Set([401, 403, 429]);

export interface ProxyResult {
  response: Response;
  key: string;
  cached: boolean;
}

/**
 * 向 Finnhub 发起请求，自动注入 token
 * 失败时自动切换 key 重试一次
 */
export async function proxyToFinnhub(
  request: Request,
  keyPool: KeyPool,
): Promise<ProxyResult> {
  const url = new URL(request.url);

  // 移除客户端传入的 token（我们用内部 key）
  url.searchParams.delete('token');

  const key = keyPool.acquire();
  if (!key) {
    return {
      response: new Response(JSON.stringify({ error: 'All API keys exhausted, retry later' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }),
      key: '',
      cached: false,
    };
  }

  const result = await doFetch(url, key, request);

  // 失败时自动切换 key 重试一次
  if (FAILURE_CODES.has(result.status)) {
    keyPool.reportFailure(key);
    const retryKey = keyPool.acquire();
    if (retryKey) {
      const retry = await doFetch(url, retryKey, request);
      if (!FAILURE_CODES.has(retry.status)) {
        keyPool.reportSuccess(retryKey);
        return { response: retry, key: retryKey, cached: false };
      }
      keyPool.reportFailure(retryKey);
      return { response: retry, key: retryKey, cached: false };
    }
  } else {
    keyPool.reportSuccess(key);
  }

  return { response: result, key, cached: false };
}

async function doFetch(url: URL, key: string, original: Request): Promise<Response> {
  const target = new URL(url.pathname + url.search, FINNHUB_BASE);
  target.searchParams.set('token', key);

  const resp = await fetch(target.toString(), {
    method: original.method,
    headers: {
      'User-Agent': 'FinnhubRouter/1.0',
      'Accept': 'application/json',
    },
  });

  // 透传响应，移除敏感 header
  const headers = new Headers(resp.headers);
  headers.delete('set-cookie');
  headers.set('X-Finnhub-Router', 'true');

  return new Response(resp.body, {
    status: resp.status,
    headers,
  });
}
