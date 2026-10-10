export interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function retry<T>(fn: (attempt: number) => Promise<T>, o: RetryOptions): Promise<T> {
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
