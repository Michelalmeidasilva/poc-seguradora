import { describe, expect, it } from 'vitest';
import { Bulkhead } from './bulkhead';
import { CircuitBreaker, CircuitOpenError } from './circuit-breaker';
import { createPolicy } from './policy';

const make = (failureThreshold = 2) => {
  const clock = { t: 0 };
  const breaker = new CircuitBreaker({
    failureThreshold,
    resetTimeoutMs: 1000,
    now: () => clock.t,
  });
  const bulkhead = new Bulkhead({ maxConcurrent: 4, maxQueue: 4 });
  const policy = createPolicy({
    timeoutMs: 50,
    retry: { retries: 2, baseDelayMs: 1, maxDelayMs: 1, sleep: async () => {} },
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
});
