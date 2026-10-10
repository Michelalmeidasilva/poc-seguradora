import { describe, expect, it } from 'vitest';
import { TokenBucket } from './token-bucket';

const make = (o: { capacity?: number; refillPerSecond?: number; maxKeys?: number } = {}) => {
  const clock = { t: 0 };
  const bucket = new TokenBucket({
    capacity: o.capacity ?? 2,
    refillPerSecond: o.refillPerSecond ?? 1,
    now: () => clock.t,
    ...(o.maxKeys !== undefined ? { maxKeys: o.maxKeys } : {}),
  });
  return { bucket, clock };
};

describe('TokenBucket', () => {
  it('allows a burst up to capacity and then denies', () => {
    const { bucket } = make();
    expect(bucket.take('k').allowed).toBe(true);
    expect(bucket.take('k').allowed).toBe(true);
    expect(bucket.take('k').allowed).toBe(false);
  });

  it('reports how long to wait for the next token', () => {
    const { bucket } = make();
    bucket.take('k');
    bucket.take('k');
    expect(bucket.take('k')).toEqual({ allowed: false, retryAfterMs: 1000 });
  });

  it('refills over time without exceeding capacity', () => {
    const { bucket, clock } = make();
    bucket.take('k');
    bucket.take('k');
    clock.t = 1000;
    expect(bucket.take('k').allowed).toBe(true);
    expect(bucket.take('k').allowed).toBe(false);
    clock.t = 60_000;
    expect(bucket.take('k').allowed).toBe(true);
    expect(bucket.take('k').allowed).toBe(true);
    expect(bucket.take('k').allowed).toBe(false);
  });

  it('keeps keys independent', () => {
    const { bucket } = make({ capacity: 1 });
    expect(bucket.take('a').allowed).toBe(true);
    expect(bucket.take('b').allowed).toBe(true);
    expect(bucket.take('a').allowed).toBe(false);
  });

  it('evicts the least recently used key beyond maxKeys', () => {
    const { bucket } = make({ capacity: 1, maxKeys: 2 });
    bucket.take('a');
    bucket.take('b');
    bucket.take('c');
    expect(bucket.take('a').allowed).toBe(true);
  });

  it('rejects invalid options', () => {
    expect(() => new TokenBucket({ capacity: 0, refillPerSecond: 1 })).toThrow(RangeError);
    expect(() => new TokenBucket({ capacity: 1, refillPerSecond: 0 })).toThrow(RangeError);
    expect(() => new TokenBucket({ capacity: 1, refillPerSecond: Number.NaN })).toThrow(RangeError);
  });
});
