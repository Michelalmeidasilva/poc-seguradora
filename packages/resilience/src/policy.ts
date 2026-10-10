import type { Bulkhead } from './bulkhead';
import type { CircuitBreaker } from './circuit-breaker';
import { retry, type RetryOptions } from './retry';
import { withTimeout } from './timeout';

export interface PolicyOptions {
  timeoutMs: number;
  retry: RetryOptions;
  breaker: CircuitBreaker;
  bulkhead: Bulkhead;
}

// bulkhead → circuit breaker → retry → timeout → function
export function createPolicy(o: PolicyOptions) {
  return <T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> =>
    o.bulkhead.execute(() =>
      o.breaker.execute(() => retry(() => withTimeout(fn, o.timeoutMs), o.retry)),
    );
}
