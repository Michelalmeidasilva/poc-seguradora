export type TabStatus = 'active' | 'other-tab';

export interface TabGuard {
  status(): TabStatus;
  subscribe(fn: (status: TabStatus) => void): () => void;
  takeOver(): void;
  dispose(): void;
}

/**
 * Only one tab may hold the chat stream (the gateway keeps one stream per session). The tab
 * that holds the Web Lock is `active`; the others show a notice and may take over.
 */
export function createTabGuard(locks: LockManager | undefined, name = 'seguradora-chat'): TabGuard {
  const listeners = new Set<(s: TabStatus) => void>();
  let current: TabStatus = locks ? 'other-tab' : 'active';
  let release: (() => void) | undefined;
  let disposed = false;
  let requestSeq = 0;

  const set = (next: TabStatus) => {
    if (current === next) return;
    current = next;
    for (const fn of listeners) fn(next);
  };

  const request = (steal: boolean) => {
    if (!locks || disposed) return;
    const options = steal ? { steal: true } : { ifAvailable: true };
    const mine = ++requestSeq;
    locks
      .request(name, options, async (lock) => {
        if (!lock) {
          set('other-tab');
          return;
        }
        if (disposed) return;
        set('active');
        // Hold the lock until this tab is disposed (or the lock is stolen, which rejects below).
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      })
      .catch(() => {
        // Stolen by another tab: this one is demoted and does not fight back. A rejection of an
        // older request, after a newer one was granted, must not demote the tab.
        if (mine === requestSeq) set('other-tab');
      });
  };

  // Async like the real LockManager callback, so subscribers attached right after creation see the first status.
  queueMicrotask(() => request(false));

  return {
    status: () => current,
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    takeOver: () => {
      if (current === 'active') return;
      request(true);
    },
    dispose() {
      disposed = true;
      release?.();
      listeners.clear();
    },
  };
}
