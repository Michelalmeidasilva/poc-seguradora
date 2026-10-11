import { useCallback, useEffect, useRef, useState } from 'react';
import { createTabGuard, type TabGuard, type TabStatus } from './tab-lock';

const browserLocks = (): LockManager | undefined =>
  typeof navigator === 'undefined' ? undefined : navigator.locks;

export function useTabGuard(external?: TabGuard): { status: TabStatus; takeOver(): void } {
  const guardRef = useRef<TabGuard | undefined>(external);
  const [status, setStatus] = useState<TabStatus>(
    () => external?.status() ?? (browserLocks() ? 'other-tab' : 'active'),
  );

  // The guard is created inside the effect (never in render): StrictMode runs
  // effect -> cleanup -> effect, and each run owns and disposes its own guard.
  useEffect(() => {
    const guard = external ?? createTabGuard(browserLocks());
    guardRef.current = guard;
    setStatus(guard.status());
    const off = guard.subscribe(setStatus);
    return () => {
      off();
      guardRef.current = undefined;
      if (!external) guard.dispose();
    };
  }, [external]);

  const takeOver = useCallback(() => guardRef.current?.takeOver(), []);
  return { status, takeOver };
}
