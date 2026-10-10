export interface TakeResult {
  allowed: boolean;
  retryAfterMs: number;
}

export interface TokenBucketOptions {
  capacity: number;
  refillPerSecond: number;
  maxKeys?: number;
  now?: () => number;
}

/** Token bucket rate limiter keyed by string; the least recently used keys are evicted. */
export class TokenBucket {
  private readonly buckets = new Map<string, { tokens: number; updated: number }>();
  private readonly now: () => number;
  private readonly maxKeys: number;

  constructor(private readonly o: TokenBucketOptions) {
    if (!Number.isInteger(o.capacity) || o.capacity < 1) {
      throw new RangeError(`TokenBucket: capacity must be an integer >= 1, got ${o.capacity}`);
    }
    if (!Number.isFinite(o.refillPerSecond) || o.refillPerSecond <= 0) {
      throw new RangeError(
        `TokenBucket: refillPerSecond must be a finite number > 0, got ${o.refillPerSecond}`,
      );
    }
    this.now = o.now ?? Date.now;
    this.maxKeys = o.maxKeys ?? 10_000;
  }

  take(key: string): TakeResult {
    const t = this.now();
    const bucket = this.buckets.get(key) ?? { tokens: this.o.capacity, updated: t };
    const elapsedSeconds = Math.max(0, t - bucket.updated) / 1000;
    const tokens = Math.min(
      this.o.capacity,
      bucket.tokens + elapsedSeconds * this.o.refillPerSecond,
    );
    const allowed = tokens >= 1;

    this.buckets.delete(key);
    this.buckets.set(key, { tokens: allowed ? tokens - 1 : tokens, updated: t });
    if (this.buckets.size > this.maxKeys) {
      const oldest = this.buckets.keys().next().value;
      if (oldest !== undefined) this.buckets.delete(oldest);
    }

    if (allowed) return { allowed: true, retryAfterMs: 0 };
    return {
      allowed: false,
      retryAfterMs: Math.ceil(((1 - tokens) / this.o.refillPerSecond) * 1000),
    };
  }
}
