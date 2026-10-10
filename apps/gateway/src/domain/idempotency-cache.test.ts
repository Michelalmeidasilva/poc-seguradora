import { describe, expect, it } from 'vitest';
import { IdempotencyCache } from './idempotency-cache';

describe('IdempotencyCache', () => {
  it('reports an id as new only the first time', () => {
    const cache = new IdempotencyCache(10);
    expect(cache.register('a')).toBe(false);
    expect(cache.register('a')).toBe(true);
    expect(cache.register('b')).toBe(false);
  });

  it('allows an id again after forget', () => {
    const cache = new IdempotencyCache(10);
    cache.register('a');
    cache.forget('a');
    expect(cache.register('a')).toBe(false);
  });

  it('forgets the oldest ids beyond capacity', () => {
    const cache = new IdempotencyCache(2);
    cache.register('a');
    cache.register('b');
    cache.register('c');
    expect(cache.register('a')).toBe(false);
    expect(cache.register('c')).toBe(true);
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects capacity %s', (capacity) => {
    expect(() => new IdempotencyCache(capacity)).toThrow(RangeError);
  });
});
