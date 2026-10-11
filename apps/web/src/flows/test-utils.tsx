import { render } from '@testing-library/react';
import { type ReactElement, useReducer } from 'react';
import { FlowProvider } from './FlowContext';
import { initRuntime, reduce, type RuntimeState, scopeOf } from './runtime';
import type { FlowJson } from './schema';

interface Options {
  /** Initial screen data (as if passed by the first navigation). */
  data?: Record<string, unknown>;
  state?: RuntimeState;
  footerSlot?: HTMLElement | null;
}

function Harness({
  flow,
  options,
  children,
}: {
  flow: FlowJson;
  options: Options;
  children: ReactElement;
}) {
  const [state, dispatch] = useReducer(
    (s: RuntimeState, e: Parameters<typeof reduce>[2]) => reduce(flow, s, e),
    options.state ?? initRuntime(flow, options.data),
  );
  return (
    <FlowProvider
      value={{
        flow,
        state,
        scope: scopeOf(state),
        dispatch,
        runAction: () => {},
        footerSlot: options.footerSlot ?? null,
      }}
    >
      {children}
    </FlowProvider>
  );
}

/** Renders `ui` inside a FlowProvider backed by the real reducer. */
export function renderInFlow(ui: ReactElement, flow: FlowJson, options: Options = {}) {
  return render(
    <Harness flow={flow} options={options}>
      {ui}
    </Harness>,
  );
}

/** A one-screen flow with the given children (no Footer; for component tests only). */
export function flowOf(children: unknown[]): FlowJson {
  return {
    version: '7.0',
    screens: [{ id: 'MAIN', terminal: true, layout: { type: 'SingleColumnLayout', children } }],
  } as FlowJson;
}
