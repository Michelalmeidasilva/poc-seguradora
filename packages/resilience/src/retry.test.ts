import { describe, expect, it } from 'vitest';
import { retry } from './retry';

const noSleep = async () => {};

describe('retry', () => {
  it('returns the first success without retrying', async () => {
    let calls = 0;
    const r = await retry(async () => ++calls, {
      retries: 3,
      baseDelayMs: 10,
      maxDelayMs: 100,
      sleep: noSleep,
    });
    expect(r).toBe(1);
    expect(calls).toBe(1);
  });

  it('succeeds after transient failures', async () => {
    let calls = 0;
    const r = await retry(
      async () => {
        calls++;
        if (calls < 3) throw new Error('flaky');
        return 'ok';
      },
      { retries: 3, baseDelayMs: 10, maxDelayMs: 100, sleep: noSleep },
    );
    expect(r).toBe('ok');
    expect(calls).toBe(3);
  });

  it('throws the last error after exhausting retries', async () => {
    let calls = 0;
    await expect(
      retry(
        async () => {
          calls++;
          throw new Error(`fail ${calls}`);
        },
        { retries: 2, baseDelayMs: 10, maxDelayMs: 100, sleep: noSleep },
      ),
    ).rejects.toThrow('fail 3');
    expect(calls).toBe(3);
  });

  it('calls the function exactly once when retries is 0', async () => {
    let calls = 0;
    await expect(
      retry(
        async () => {
          calls++;
          throw new Error('x');
        },
        { retries: 0, baseDelayMs: 10, maxDelayMs: 100, sleep: noSleep },
      ),
    ).rejects.toThrow('x');
    expect(calls).toBe(1);
  });

  it('does not retry when shouldRetry returns false', async () => {
    let calls = 0;
    await expect(
      retry(
        async () => {
          calls++;
          throw new Error('fatal');
        },
        {
          retries: 5,
          baseDelayMs: 10,
          maxDelayMs: 100,
          sleep: noSleep,
          shouldRetry: () => false,
        },
      ),
    ).rejects.toThrow('fatal');
    expect(calls).toBe(1);
  });

  it('uses exponential backoff capped at maxDelayMs with full jitter', async () => {
    const delays: number[] = [];
    await expect(
      retry(
        async () => {
          throw new Error('x');
        },
        {
          retries: 3,
          baseDelayMs: 100,
          maxDelayMs: 250,
          sleep: async (ms) => {
            delays.push(ms);
          },
          random: () => 1,
        },
      ),
    ).rejects.toThrow('x');
    expect(delays).toEqual([100, 200, 250]);
  });

  it('applies jitter between 0 and the cap', async () => {
    const delays: number[] = [];
    await expect(
      retry(
        async () => {
          throw new Error('x');
        },
        {
          retries: 1,
          baseDelayMs: 100,
          maxDelayMs: 1000,
          sleep: async (ms) => {
            delays.push(ms);
          },
          random: () => 0.5,
        },
      ),
    ).rejects.toThrow('x');
    expect(delays).toEqual([50]);
  });

  it('passes the attempt number to the function', async () => {
    const seen: number[] = [];
    await expect(
      retry(
        async (attempt) => {
          seen.push(attempt);
          throw new Error('x');
        },
        { retries: 2, baseDelayMs: 1, maxDelayMs: 1, sleep: noSleep },
      ),
    ).rejects.toThrow('x');
    expect(seen).toEqual([0, 1, 2]);
  });

  it('treats a synchronous throw as a failure', async () => {
    let calls = 0;
    const fn = (() => {
      calls++;
      throw new Error('sync boom');
    }) as unknown as () => Promise<never>;
    await expect(
      retry(fn, { retries: 1, baseDelayMs: 1, maxDelayMs: 1, sleep: noSleep }),
    ).rejects.toThrow('sync boom');
    expect(calls).toBe(2);
  });
});

describe('retry input guards', () => {
  const base = { retries: 1, baseDelayMs: 1, maxDelayMs: 1, sleep: noSleep };
  const run = (o: Partial<typeof base>) => retry(async () => 1, { ...base, ...o });
  it.each([NaN, Infinity, -1, 1.5])('rejects retries %s', async (retries) => {
    await expect(run({ retries })).rejects.toThrow(RangeError);
  });
  it.each([NaN, Infinity, -1])('rejects baseDelayMs %s', async (baseDelayMs) => {
    await expect(run({ baseDelayMs })).rejects.toThrow(RangeError);
  });
  it.each([NaN, Infinity, -1])('rejects maxDelayMs %s', async (maxDelayMs) => {
    await expect(run({ maxDelayMs })).rejects.toThrow(RangeError);
  });
});
