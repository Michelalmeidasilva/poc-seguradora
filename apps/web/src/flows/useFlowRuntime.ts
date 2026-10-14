import { useCallback, useRef, useState } from 'react';
import { type ActionOrigin, type FlowHost, runAction as run } from './actions';
import { initRuntime, reduce, type RuntimeEvent, type RuntimeState } from './runtime';
import type { FlowAction, FlowJson } from './schema';

export interface FlowRuntime {
  state: RuntimeState;
  dispatch(event: RuntimeEvent): void;
  /** The latest state, including events dispatched earlier in the same tick. */
  getState(): RuntimeState;
  runAction(action: FlowAction, origin?: ActionOrigin): void;
}

/**
 * Owns the runtime state of one open Flow. `dispatch` reduces eagerly into a ref, so an action
 * run right after a `set` (same tick) sees it. Callbacks are stable; `flow`, `flowId` and `host`
 * are read through refs, so their identity may change between renders.
 */
export function useFlowRuntime(
  flow: FlowJson,
  flowId: string,
  host: FlowHost,
  initialData?: Record<string, unknown>,
): FlowRuntime {
  const [state, setState] = useState(() => initRuntime(flow, initialData, initialData));
  const stateRef = useRef(state);
  const latest = useRef({ flow, flowId, host });
  latest.current = { flow, flowId, host };

  const dispatch = useCallback((event: RuntimeEvent) => {
    const next = reduce(latest.current.flow, stateRef.current, event);
    if (next === stateRef.current) return;
    stateRef.current = next;
    setState(next);
  }, []);

  const getState = useCallback(() => stateRef.current, []);

  const runAction = useCallback(
    (action: FlowAction, origin?: ActionOrigin) => {
      const hostProxy: FlowHost = {
        submit: (...a) => latest.current.host.submit(...a),
        exchange: (...a) => latest.current.host.exchange(...a),
        openUrl: (url) => latest.current.host.openUrl(url),
        close: () => latest.current.host.close(),
      };
      run(
        action,
        {
          flow: latest.current.flow,
          flowId: latest.current.flowId,
          getState,
          dispatch,
          host: hostProxy,
        },
        origin,
      );
    },
    [dispatch, getState],
  );

  return { state, dispatch, getState, runAction };
}
