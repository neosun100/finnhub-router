import { describe, it, expect } from 'vitest';
import { ResponseCache } from '../src/cache';

describe('ResponseCache', () => {
  it('returns null for missing key', () => {
    const cache = new ResponseCache(30);
    expect(cache.get('/test')).toBeNull();
  });

  it('stores and retrieves entry', () => {
    const cache = new ResponseCache(30);
    cache.set('/test', '{"c":100}', 200, { 'Content-Type': 'application/json' });
    const hit = cache.get('/test');
    expect(hit).not.toBeNull();
    expect(hit!.body).toBe('{"c":100}');
    expect(hit!.status).toBe(200);
  });

  it('expires entries after TTL', async () => {
    const cache = new ResponseCache(0.01); // 10ms TTL
    cache.set('/test', 'data', 200, {});
    await new Promise(r => setTimeout(r, 20));
    expect(cache.get('/test')).toBeNull();
  });

  it('generates cache key stripping token param', () => {
    const url = new URL('https://example.com/api/v1/quote?symbol=AAPL&token=xxx');
    expect(ResponseCache.cacheKey(url)).toBe('/api/v1/quote?symbol=AAPL');
  });

  it('generates cache key with no params', () => {
    const url = new URL('https://example.com/api/v1/news');
    expect(ResponseCache.cacheKey(url)).toBe('/api/v1/news');
  });

  it('tracks size', () => {
    const cache = new ResponseCache(30);
    expect(cache.size).toBe(0);
    cache.set('/a', 'a', 200, {});
    cache.set('/b', 'b', 200, {});
    expect(cache.size).toBe(2);
  });
});
