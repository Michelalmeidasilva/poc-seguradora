import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTabGuard } from './useTabGuard';

/** A minimal LockManager: one holder per name; `steal` rejects the current holder. */
function fakeLocks() {
  const holders = new Map<string, { release(): void; abort(): void }>();
  return {
    request(
      name: string,
      options: { ifAvailable?: boolean; steal?: boolean },
      cb: (lock: object | null) => Promise<void>,
    ) {
      const current = holders.get(name);
      if (current && options.ifAvailable) return cb(null).then(() => undefined);
      if (current && options.steal) current.abort();
      return new Promise<void>((resolve, reject) => {
        const entry = {
          release: () => {
            holders.delete(name);
            resolve();
          },
          abort: () => {
            holders.delete(name);
            reject(new DOMException('stolen', 'AbortError'));
          },
        };
        holders.set(name, entry);
        void Promise.resolve().then(() => cb({}).then(() => entry.release()));
      });
    },
  };
}

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });

afterEach(() => vi.unstubAllGlobals());

describe('useTabGuard under StrictMode', () => {
  it('becomes active for a single tab and keeps takeOver alive', async () => {
    const locks = fakeLocks();
    vi.stubGlobal('navigator', { ...navigator, locks });
    const first = renderHook(() => useTabGuard(), { wrapper: StrictMode });
    await settle();
    expect(first.result.current.status).toBe('active');

    const second = renderHook(() => useTabGuard(), { wrapper: StrictMode });
    await settle();
    expect(second.result.current.status).toBe('other-tab');
    act(() => second.result.current.takeOver());
    await settle();
    expect(second.result.current.status).toBe('active');
    expect(first.result.current.status).toBe('other-tab');
  });
});
