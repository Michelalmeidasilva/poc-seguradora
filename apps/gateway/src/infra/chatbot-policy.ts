import { Bulkhead, CircuitBreaker, createPolicy, TimeoutError } from '@seguradora/resilience';
import { ChatbotHttpError } from '../application/errors';

const RETRYABLE_STATUS = new Set([502, 503, 504]);

/**
 * undici wraps network failures (DNS, refused, reset) in `TypeError('fetch failed')`.
 * Other TypeErrors (invalid header value, bad arguments) are not upstream problems.
 */
const isNetworkError = (error: unknown): boolean =>
  error instanceof TypeError && error.message === 'fetch failed';

/** Safe to repeat: the chatbot is idempotent by event id and nothing was delivered. */
export const isSafeToRetry = (error: unknown): boolean =>
  error instanceof TimeoutError ||
  isNetworkError(error) ||
  (error instanceof ChatbotHttpError && RETRYABLE_STATUS.has(error.status));

/** Problems of the upstream itself (not of the request) count towards the circuit breaker. */
export const isUpstreamFailure = (error: unknown): boolean =>
  error instanceof TimeoutError ||
  isNetworkError(error) ||
  (error instanceof ChatbotHttpError && error.status >= 500);

export interface ChatbotPolicyOptions {
  connectTimeoutMs: number;
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

/** bulkhead → circuit breaker → retry → timeout, applied to opening the chatbot connection. */
export function createChatbotPolicy(o: ChatbotPolicyOptions) {
  return createPolicy({
    timeoutMs: o.connectTimeoutMs,
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
