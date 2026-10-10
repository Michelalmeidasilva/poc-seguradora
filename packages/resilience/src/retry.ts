export interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /**
   * Decides whether a failed attempt is retried. Defaults to retrying every error when
   * used standalone; `createPolicy` makes it required so callers must opt in explicitly.
   */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function retry<T>(fn: (attempt: number) => Promise<T>, o: RetryOptions): Promise<T> {
  if (!Number.isInteger(o.retries) || o.retries < 0) {
    throw new RangeError(`retry: retries must be a finite integer >= 0, got ${o.retries}`);
  }
  for (const key of ['baseDelayMs', 'maxDelayMs'] as const) {
    if (!Number.isFinite(o[key]) || o[key] < 0) {
      throw new RangeError(`retry: ${key} must be a finite number >= 0, got ${o[key]}`);
    }
  }
  const sleep = o.sleep ?? defaultSleep;
  const random = o.random ?? Math.random;
  const shouldRetry = o.shouldRetry ?? (() => true);

  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      if (attempt >= o.retries || !shouldRetry(error, attempt)) throw error;
      const cap = Math.min(o.maxDelayMs, o.baseDelayMs * 2 ** attempt);
      await sleep(Math.floor(random() * cap));
    }
  }
}
