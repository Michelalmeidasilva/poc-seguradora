import { createContext, type ReactNode, useContext } from 'react';
import type { Scope } from './expr';
import type { RuntimeEvent, RuntimeState } from './runtime';
import type { FlowAction, FlowJson } from './schema';

export interface FlowContextValue {
  flow: FlowJson;
  state: RuntimeState;
  scope: Scope;
  dispatch: (event: RuntimeEvent) => void;
  /** Wired to the action runner in a later task; a no-op until then. */
  runAction: (action: FlowAction) => void;
  /** Sheet footer container; Footer portals into it when present, renders inline otherwise. */
  footerSlot: HTMLElement | null;
}

const FlowCtx = createContext<FlowContextValue | null>(null);

export function FlowProvider({
  value,
  children,
}: {
  value: FlowContextValue;
  children: ReactNode;
}) {
  return <FlowCtx.Provider value={value}>{children}</FlowCtx.Provider>;
}

export function useFlow(): FlowContextValue {
  const ctx = useContext(FlowCtx);
  if (!ctx) throw new Error('useFlow must be used inside <FlowProvider>');
  return ctx;
}
