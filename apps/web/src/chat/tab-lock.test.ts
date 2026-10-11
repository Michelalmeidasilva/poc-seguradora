import { describe, expect, it } from 'vitest';
import { createTabGuard } from './tab-lock';

/** A minimal LockManager: one holder per name; `steal` rejects the current holder. */
function fakeLocks() {
  const holders = new Map<string, { release(): void; abort(): void }>();
  const manager = {
    request(
      name: string,
      options: { ifAvailable?: boolean; steal?: boolean },
      cb: (lock: object | null) => Promise<void>,
    ) {
      const current = holders.get(name);
      if (current && options.ifAvailable) return cb(null).then(() => undefined);
      if (current && options.steal) current.abort();
      return new Promise<void>((resolve, reject) => {
        let released = false;
        const entry = {
          release: () => {
            if (!released) {
              released = true;
              holders.delete(name);
              resolve();
            }
          },
          abort: () => {
            released = true;
            holders.delete(name);
            reject(new DOMException('stolen', 'AbortError'));
          },
        };
        holders.set(name, entry);
        void cb({}).then(() => entry.release());
      });
    },
  };
  return manager as unknown as LockManager;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('createTabGuard', () => {
  it('is always active when the Web Locks API is unavailable', () => {
    const guard = createTabGuard(undefined);
    expect(guard.status()).toBe('active');
    guard.dispose();
  });

  it('gives the lock to the first tab and reports other-tab to the second', async () => {
    const locks = fakeLocks();
    const first = createTabGuard(locks);
    await tick();
    const second = createTabGuard(locks);
    await tick();
    expect(first.status()).toBe('active');
    expect(second.status()).toBe('other-tab');
    first.dispose();
    second.dispose();
  });

  it('lets the second tab take over, demoting the first', async () => {
    const locks = fakeLocks();
    const first = createTabGuard(locks);
    await tick();
    const second = createTabGuard(locks);
    await tick();
    const seen: string[] = [];
    first.subscribe((s) => seen.push(s));
    second.takeOver();
    await tick();
    expect(second.status()).toBe('active');
    expect(first.status()).toBe('other-tab');
    expect(seen).toEqual(['other-tab']);
    first.dispose();
    second.dispose();
  });

  it('does not steal back by itself after being demoted', async () => {
    const locks = fakeLocks();
    const first = createTabGuard(locks);
    await tick();
    const second = createTabGuard(locks);
    await tick();
    second.takeOver();
    await tick();
    await tick();
    expect(first.status()).toBe('other-tab');
    expect(second.status()).toBe('active');
    first.dispose();
    second.dispose();
  });

  it('frees the lock on dispose so a new tab becomes active', async () => {
    const locks = fakeLocks();
    const first = createTabGuard(locks);
    await tick();
    first.dispose();
    await tick();
    const second = createTabGuard(locks);
    await tick();
    expect(second.status()).toBe('active');
    second.dispose();
  });

  it('notifies subscribers and allows unsubscribing', async () => {
    const locks = fakeLocks();
    const guard = createTabGuard(locks);
    const seen: string[] = [];
    const off = guard.subscribe((s) => seen.push(s));
    await tick();
    off();
    guard.dispose();
    expect(seen).toEqual(['active']);
  });

  it('takeOver() while already active is a no-op', async () => {
    const locks = fakeLocks();
    const guard = createTabGuard(locks);
    await tick();
    const seen: string[] = [];
    guard.subscribe((s) => seen.push(s));
    guard.takeOver();
    await tick();
    expect(guard.status()).toBe('active');
    expect(seen).toEqual([]);
    guard.dispose();
  });
});
