import { useMemo, useRef } from 'react';
import type { FlowHost } from './actions';
import type { FlowContextValue } from './FlowContext';
import { currentScreen, scopeOf } from './runtime';
import type { FlowJson, FlowScreen } from './schema';
import { useFlowRuntime } from './useFlowRuntime';

export interface FlowSheetCallbacks {
  submit: FlowHost['submit'];
  exchange: FlowHost['exchange'];
  onClose(): void;
}

export interface FlowSheetSession {
  context: FlowContextValue;
  screen: FlowScreen;
  canGoBack: boolean;
  back(): void;
  /** Whether closing would lose input: the user set or touched a field (seeding does not count). */
  isDirty(): boolean;
}

/** Glue between the sheet and the runtime: the FlowHost and the FlowContext value. */
export function useFlowSheet(
  flow: FlowJson,
  flowId: string,
  callbacks: FlowSheetCallbacks,
  footerSlot: HTMLElement | null,
): FlowSheetSession {
  const latest = useRef(callbacks);
  latest.current = callbacks;
  const host = useMemo<FlowHost>(
    () => ({
      submit: (...a) => latest.current.submit(...a),
      exchange: (...a) => latest.current.exchange(...a),
      openUrl: (url) => {
        window.open(url, '_blank', 'noopener,noreferrer');
      },
      close: () => latest.current.onClose(),
    }),
    [],
  );
  const { state, dispatch, getState, runAction } = useFlowRuntime(flow, flowId, host);

  return {
    context: { flow, state, scope: scopeOf(state), dispatch, runAction, footerSlot },
    screen: currentScreen(flow, state),
    canGoBack: state.stack.length > 1 && !state.outcome,
    back: () => dispatch({ type: 'back' }),
    isDirty: () => {
      const s = getState();
      if (s.outcome) return false;
      return s.edited === true || Object.keys(s.touched).length > 0;
    },
  };
}
