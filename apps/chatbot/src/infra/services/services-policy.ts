import { Bulkhead, CircuitBreaker, createPolicy, TimeoutError } from '@seguradora/resilience';

/** A service answered with an HTTP status that the policy treats as an upstream problem. */
export class ServiceHttpError extends Error {
  constructor(readonly status: number) {
    super(`Service responded with HTTP ${status}`);
    this.name = 'ServiceHttpError';
  }
}

const RETRYABLE_STATUS = new Set([502, 503, 504]);

/** undici wraps real network failures (DNS, refused, reset) as `TypeError('fetch failed')`. */
const isNetworkError = (error: unknown): boolean =>
  error instanceof TypeError && error.message === 'fetch failed';

/** Safe to repeat: GETs are idempotent and POSTs carry an Idempotency-Key. */
export const isSafeToRetry = (error: unknown): boolean =>
  error instanceof TimeoutError ||
  isNetworkError(error) ||
  (error instanceof ServiceHttpError && RETRYABLE_STATUS.has(error.status));

/** Problems of the upstream itself (not of the request) count towards the circuit breaker. */
export const isUpstreamFailure = (error: unknown): boolean =>
  error instanceof TimeoutError ||
  isNetworkError(error) ||
  (error instanceof ServiceHttpError && (error.status >= 500 || error.status === 429));

export interface ServicePolicyOptions {
  timeoutMs: number;
  retries: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  breakerFailureThreshold: number;
  breakerResetMs: number;
  bulkheadMaxConcurrent: number;
  bulkheadMaxQueue: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** bulkhead → circuit breaker → retry → timeout; create one per service. */
export function createServicePolicy(o: ServicePolicyOptions) {
  return createPolicy({
    timeoutMs: o.timeoutMs,
    retry: {
      retries: o.retries,
      baseDelayMs: o.retryBaseDelayMs,
      maxDelayMs: o.retryMaxDelayMs,
      shouldRetry: isSafeToRetry,
      ...(o.sleep ? { sleep: o.sleep } : {}),
    },
    breaker: new CircuitBreaker({
      failureThreshold: o.breakerFailureThreshold,
      resetTimeoutMs: o.breakerResetMs,
      isFailure: isUpstreamFailure,
      ...(o.now ? { now: o.now } : {}),
    }),
    bulkhead: new Bulkhead({
      maxConcurrent: o.bulkheadMaxConcurrent,
      maxQueue: o.bulkheadMaxQueue,
    }),
  });
}
