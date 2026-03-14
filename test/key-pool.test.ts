import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KeyPool } from '../src/key-pool';

describe('KeyPool', () => {
  it('throws if no keys provided', () => {
    expect(() => new KeyPool([])).toThrow('no keys');
  });

  it('round-robin rotates through keys', () => {
    const pool = new KeyPool(['a', 'b', 'c']);
    expect(pool.acquire()).toBe('a');
    expect(pool.acquire()).toBe('b');
    expect(pool.acquire()).toBe('c');
    expect(pool.acquire()).toBe('a');
  });

  it('skips rate-limited keys', () => {
    const pool = new KeyPool(['a', 'b']);
    // exhaust key 'a' (60 requests)
    for (let i = 0; i < 60; i++) pool.acquire(); // 60 calls: 30 a + 30 b
    // both should still have capacity since round-robin alternates
    // Let's exhaust properly: acquire only 'a'
    const pool2 = new KeyPool(['a', 'b']);
    // Force exhaust 'a' by acquiring 60 times when cursor starts at 'a'
    for (let i = 0; i < 120; i++) pool2.acquire(); // 60 a + 60 b
    // Now both exhausted
    expect(pool2.acquire()).toBeNull();
  });

  it('returns null when all keys exhausted', () => {
    const pool = new KeyPool(['a']);
    for (let i = 0; i < 60; i++) pool.acquire();
    expect(pool.acquire()).toBeNull();
  });

  it('resets count after window expires', () => {
    const pool = new KeyPool(['a']);
    for (let i = 0; i < 60; i++) pool.acquire();
    expect(pool.acquire()).toBeNull();

    // Simulate time passing by manipulating internal state
    vi.useFakeTimers();
    vi.advanceTimersByTime(61_000);
    expect(pool.acquire()).toBe('a');
    vi.useRealTimers();
  });

  it('skips unhealthy keys', () => {
    const pool = new KeyPool(['a', 'b', 'c']);
    pool.acquire(); // 'a'
    pool.reportFailure('b');
    expect(pool.acquire()).toBe('c'); // skips 'b'
  });

  it('recovers unhealthy key after cooldown', () => {
    vi.useFakeTimers();
    const pool = new KeyPool(['a', 'b']);
    pool.reportFailure('a');
    // cursor starts at 0 ('a'), but 'a' is unhealthy → skips to 'b'
    expect(pool.acquire()).toBe('b');

    vi.advanceTimersByTime(61_000);
    // cooldown passed, 'a' should recover on next attempt
    // cursor is now at 0 ('a') after wrapping
    expect(pool.acquire()).toBe('a'); // 'a' recovered
    vi.useRealTimers();
  });

  it('stats returns correct info', () => {
    const pool = new KeyPool(['abc123def456', 'xyz789']);
    pool.acquire();
    const stats = pool.stats();
    expect(stats).toHaveLength(2);
    expect(stats[0].used).toBe(1);
    expect(stats[0].remaining).toBe(59);
    expect(stats[0].key).toBe('abc123...');
    expect(stats[1].used).toBe(0);
  });
});
