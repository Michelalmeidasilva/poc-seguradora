import { describe, expect, it } from 'vitest';
import { Bulkhead, BulkheadFullError } from './bulkhead';
import { CircuitBreaker, CircuitOpenError } from './circuit-breaker';
import { createPolicy } from './policy';

const make = (failureThreshold = 2, bulkheadOpts = { maxConcurrent: 4, maxQueue: 4 }) => {
  const clock = { t: 0 };
  const breaker = new CircuitBreaker({
    failureThreshold,
    resetTimeoutMs: 1000,
    now: () => clock.t,
  });
  const bulkhead = new Bulkhead(bulkheadOpts);
  const policy = createPolicy({
    timeoutMs: 50,
    retry: {
      retries: 2,
      baseDelayMs: 1,
      maxDelayMs: 1,
      sleep: async () => {},
      shouldRetry: (e) => !(e instanceof CircuitOpenError) && !(e instanceof RangeError),
    },
    breaker,
    bulkhead,
  });
  return { policy, breaker };
};

describe('createPolicy', () => {
  it('recovers from transient failures through retry', async () => {
    const { policy } = make();
    let calls = 0;
    const r = await policy(async () => {
      calls++;
      if (calls < 3) throw new Error('flaky');
      return 'ok';
    });
    expect(r).toBe('ok');
    expect(calls).toBe(3);
  });

  it('times out slow calls and counts them as a failure', async () => {
    const { policy, breaker } = make(1);
    const never = () => new Promise<never>(() => {});
    await expect(policy(never)).rejects.toThrow(/Timed out/);
    expect(breaker.state).toBe('open');
  });

  it('does not call the function once the circuit is open and does not retry the open error', async () => {
    const { policy } = make(1);
    await expect(
      policy(async () => {
        throw new Error('down');
      }),
    ).rejects.toThrow('down');

    let calls = 0;
    await expect(
      policy(async () => {
        calls++;
        return 'x';
      }),
    ).rejects.toBeInstanceOf(CircuitOpenError);
    expect(calls).toBe(0);
  });

  it('calls a non-retryable error exactly once', async () => {
    const { policy } = make(5);
    let calls = 0;
    await expect(
      policy(async () => {
        calls++;
        throw new RangeError('bad input');
      }),
    ).rejects.toBeInstanceOf(RangeError);
    expect(calls).toBe(1);
  });

  it('propagates BulkheadFullError when the bulkhead is full', async () => {
    const { policy } = make(2, { maxConcurrent: 1, maxQueue: 0 });
    let release: () => void = () => {};
    const busy = policy(() => new Promise<void>((r) => (release = r)));
    await expect(policy(async () => 'x')).rejects.toBeInstanceOf(BulkheadFullError);
    release();
    await busy;
  });
});
