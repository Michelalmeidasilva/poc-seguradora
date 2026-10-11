import { useEffect, useMemo, useState } from 'react';
import { createTabGuard, type TabGuard, type TabStatus } from './tab-lock';

export function useTabGuard(external?: TabGuard): { status: TabStatus; takeOver(): void } {
  const guard = useMemo(
    () =>
      external ?? createTabGuard(typeof navigator === 'undefined' ? undefined : navigator.locks),
    [external],
  );
  const [status, setStatus] = useState<TabStatus>(guard.status());

  useEffect(() => {
    setStatus(guard.status());
    const off = guard.subscribe(setStatus);
    return () => {
      off();
      if (!external) guard.dispose();
    };
  }, [guard, external]);

  return { status, takeOver: () => guard.takeOver() };
}
