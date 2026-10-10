import type { Bulkhead } from './bulkhead';
import type { CircuitBreaker } from './circuit-breaker';
import { retry, type RetryOptions } from './retry';
import { withTimeout } from './timeout';

export interface PolicyOptions {
  timeoutMs: number;
  /** `shouldRetry` is required so the retry scope (e.g. never retry CircuitOpenError) is explicit. */
  retry: RetryOptions & { shouldRetry: NonNullable<RetryOptions['shouldRetry']> };
  breaker: CircuitBreaker;
  bulkhead: Bulkhead;
}

/**
 * bulkhead → circuit breaker → retry → timeout → function
 *
 * `fn` must honor the AbortSignal it receives (e.g. pass it to `fetch`); otherwise a
 * timed-out call keeps running in the background after the bulkhead slot is released.
 */
export function createPolicy(o: PolicyOptions) {
  return <T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> =>
    o.bulkhead.execute(() =>
      o.breaker.execute(() => retry(() => withTimeout(fn, o.timeoutMs), o.retry)),
    );
}
