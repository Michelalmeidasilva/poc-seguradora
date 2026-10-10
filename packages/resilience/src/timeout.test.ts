import { describe, expect, it } from 'vitest';
import { TimeoutError, withTimeout } from './timeout';

describe('withTimeout', () => {
  it('returns the value when the function finishes in time', async () => {
    await expect(withTimeout(async () => 42, 100)).resolves.toBe(42);
  });

  it('rejects with TimeoutError when the function is too slow', async () => {
    const never = () => new Promise<never>(() => {});
    await expect(withTimeout(never, 20)).rejects.toBeInstanceOf(TimeoutError);
  });

  it('aborts the signal on timeout', async () => {
    let captured: AbortSignal | undefined;
    const fn = (signal: AbortSignal) => {
      captured = signal;
      return new Promise<never>(() => {});
    };
    await expect(withTimeout(fn, 20)).rejects.toBeInstanceOf(TimeoutError);
    expect(captured?.aborted).toBe(true);
  });

  it('propagates the error of the function', async () => {
    await expect(
      withTimeout(async () => {
        throw new Error('boom');
      }, 100),
    ).rejects.toThrow('boom');
  });

  it('treats a synchronous throw as a rejection', async () => {
    const fn = (() => {
      throw new Error('sync boom');
    }) as unknown as () => Promise<never>;
    await expect(withTimeout(fn, 100)).rejects.toThrow('sync boom');
  });
});
