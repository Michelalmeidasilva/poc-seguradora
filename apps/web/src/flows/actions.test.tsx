import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSummary, type FlowHost, runAction } from './actions';
import { initRuntime, reduce, type RuntimeEvent, type RuntimeState } from './runtime';
import type { FlowAction, FlowJson } from './schema';
import { useFlowRuntime } from './useFlowRuntime';

const screenOf = (id: string, children: unknown[], extra: Record<string, unknown> = {}) => ({
  id,
  layout: { type: 'SingleColumnLayout', children },
  ...extra,
});

const completeAction: FlowAction = {
  name: 'complete',
  payload: { nome: '${form.nome}', cpf: '${form.cpf}', produto: '${form.produto}' },
};

const flow = {
  version: '7.0',
  screens: [
    screenOf(
      'FORM',
      [
        { type: 'TextInput', name: 'nome', label: 'Nome' },
        { type: 'TextInput', name: 'cpf', label: 'CPF' },
        {
          type: 'RadioButtonsGroup',
          name: 'produto',
          label: 'Produto',
          'data-source': [
            { id: 'AUTO', title: 'Auto' },
            { id: 'VIDA', title: 'Vida' },
          ],
        },
        { type: 'Footer', label: 'Enviar', 'on-click-action': completeAction },
      ],
      { terminal: true, sensitive: ['cpf'] },
    ),
  ],
} as unknown as FlowJson;

const twoScreens = {
  version: '7.0',
  screens: [
    screenOf('A', [{ type: 'TextInput', name: 'nome', label: 'Nome' }]),
    screenOf('B', [{ type: 'TextInput', name: 'obs', label: 'Obs' }], { terminal: true }),
  ],
} as unknown as FlowJson;

function fakeHost() {
  return {
    submit: vi.fn<FlowHost['submit']>(),
    exchange: vi.fn<FlowHost['exchange']>(),
    openUrl: vi.fn<FlowHost['openUrl']>(),
    close: vi.fn<FlowHost['close']>(),
  };
}

/** A pure context: state lives in a local variable, like the ref in useFlowRuntime. */
function ctxFor(f: FlowJson, events: RuntimeEvent[] = [], start?: RuntimeState) {
  let state = events.reduce((s, e) => reduce(f, s, e), start ?? initRuntime(f));
  const host = fakeHost();
  const dispatched: RuntimeEvent[] = [];
  const ctx = {
    flow: f,
    flowId: 'cotacao',
    host,
    getState: () => state,
    dispatch: (e: RuntimeEvent) => {
      dispatched.push(e);
      state = reduce(f, state, e);
    },
  };
  return { ctx, host, dispatched, state: () => state };
}

const filled: RuntimeEvent[] = [
  { type: 'set', name: 'nome', value: 'Ana' },
  { type: 'set', name: 'cpf', value: '12345678901' },
  { type: 'set', name: 'produto', value: 'AUTO' },
];

afterEach(() => vi.restoreAllMocks());

describe('runAction: complete', () => {
  it('submits the resolved payload once, with a summary, then closes', () => {
    const { ctx, host, dispatched, state } = ctxFor(flow, filled);
    runAction(completeAction, ctx);
    expect(host.submit).toHaveBeenCalledTimes(1);
    const [flowId, data, summary] = host.submit.mock.calls[0]!;
    expect(flowId).toBe('cotacao');
    expect(data).toEqual({ nome: 'Ana', cpf: '12345678901', produto: 'AUTO' });
    expect(summary).toBe('Nome: Ana\nCPF: ••••\nProduto: Auto');
    expect(host.close).toHaveBeenCalledTimes(1);
    expect(host.close.mock.invocationCallOrder[0]).toBeGreaterThan(
      host.submit.mock.invocationCallOrder[0]!,
    );
    // the reducer gets the RAW payload, never a resolved one
    expect(dispatched).toEqual([{ type: 'complete', payload: completeAction.payload }]);
    expect(state().outcome?.payload).toEqual(data);
  });

  it('submits exactly once on a double invocation', () => {
    const { ctx, host } = ctxFor(flow, filled);
    runAction(completeAction, ctx);
    runAction(completeAction, ctx);
    expect(host.submit).toHaveBeenCalledTimes(1);
    expect(host.close).toHaveBeenCalledTimes(1);
  });

  it('keeps typed ${...} text literal in the payload', () => {
    const { ctx, host } = ctxFor(flow, [{ type: 'set', name: 'nome', value: '${form.cpf}' }]);
    runAction({ name: 'complete', payload: { nome: '${form.nome}' } }, ctx);
    expect(host.submit.mock.calls[0]![1]).toEqual({ nome: '${form.cpf}' });
  });

  it('treats a missing payload as empty', () => {
    const { ctx, host } = ctxFor(flow);
    runAction({ name: 'complete' }, ctx);
    expect(host.submit).toHaveBeenCalledWith('cotacao', {}, 'Formulário enviado');
  });
});

describe('runAction: navigate', () => {
  it('dispatches the raw payload to the next screen', () => {
    const { ctx, dispatched, state } = ctxFor(twoScreens, [
      { type: 'set', name: 'nome', value: 'Ana' },
    ]);
    const payload = { nome: '${form.nome}' };
    runAction({ name: 'navigate', next: { type: 'screen', name: 'B' }, payload }, ctx);
    expect(dispatched).toEqual([{ type: 'navigate', screenId: 'B', payload }]);
    expect(state().stack.map((f) => f.screenId)).toEqual(['A', 'B']);
    expect(state().stack[1]?.data).toEqual({ nome: 'Ana' });
  });

  it('ignores a navigate without a usable next', () => {
    const { ctx, dispatched } = ctxFor(twoScreens);
    runAction({ name: 'navigate', next: null } as unknown as FlowAction, ctx);
    expect(dispatched).toEqual([]);
  });
});

describe('runAction: data_exchange', () => {
  it('sends screen, action name and resolved data, then advances to next', () => {
    const { ctx, host, dispatched, state } = ctxFor(twoScreens, [
      { type: 'set', name: 'nome', value: 'Ana' },
    ]);
    const action = {
      name: 'data_exchange',
      next: { type: 'screen', name: 'B' },
      payload: { nome: '${form.nome}' },
    } as unknown as FlowAction;
    runAction(action, ctx);
    expect(host.exchange).toHaveBeenCalledWith('cotacao', 'A', 'data_exchange', { nome: 'Ana' });
    expect(dispatched.map((e) => e.type)).toEqual(['exchange_start', 'exchange_done', 'navigate']);
    expect(state().pending).toBe('idle');
    expect(state().stack.map((f) => f.screenId)).toEqual(['A', 'B']);
    expect(host.submit).not.toHaveBeenCalled();
  });

  it('stays on a non-terminal screen without next', () => {
    const { ctx, host, state } = ctxFor(twoScreens);
    runAction({ name: 'data_exchange', payload: {} }, ctx);
    expect(host.exchange).toHaveBeenCalledTimes(1);
    expect(state().stack).toHaveLength(1);
    expect(state().pending).toBe('idle');
  });

  it('on a terminal screen submits exactly once and closes', () => {
    const { ctx, host, dispatched } = ctxFor(flow, filled);
    const action: FlowAction = { name: 'data_exchange', payload: { nome: '${form.nome}' } };
    runAction(action, ctx);
    runAction(action, ctx);
    expect(host.exchange).toHaveBeenCalledTimes(1);
    expect(host.submit).toHaveBeenCalledTimes(1);
    expect(host.submit).toHaveBeenCalledWith('cotacao', { nome: 'Ana' }, 'Nome: Ana');
    expect(host.close).toHaveBeenCalledTimes(1);
    expect(dispatched.at(-1)).toEqual({ type: 'complete', payload: action.payload });
  });
});

describe('runAction: open_url', () => {
  it('opens http(s) URLs', () => {
    const { ctx, host } = ctxFor(flow);
    runAction({ name: 'open_url', url: 'https://example.com/termos' }, ctx);
    expect(host.openUrl).toHaveBeenCalledWith('https://example.com/termos');
  });

  it.each(['javascript:alert(1)', 'data:text/html,x', 'not a url', 42])(
    'drops %s silently, without logging the URL',
    (url) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { ctx, host } = ctxFor(flow);
      runAction({ name: 'open_url', url } as unknown as FlowAction, ctx);
      expect(host.openUrl).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(warn.mock.calls)).not.toContain(String(url));
    },
  );
});

describe('runAction: update_data', () => {
  it('dispatches the raw patch and the reducer merges it', () => {
    const { ctx, dispatched, state } = ctxFor(twoScreens, [
      { type: 'set', name: 'nome', value: 'Ana' },
    ]);
    const patch = { oi: 'Oi ${form.nome}' };
    runAction({ name: 'update_data', payload: patch }, ctx);
    expect(dispatched).toEqual([{ type: 'update_data', patch }]);
    expect(state().stack[0]?.data).toEqual({ oi: 'Oi Ana' });
  });

  it('undoes a select patch on unselect for the same field name', () => {
    const { ctx, state } = ctxFor(twoScreens, [], initRuntime(twoScreens, { preco: 10 }));
    runAction({ name: 'update_data', payload: { preco: 20 } }, ctx, {
      name: 'chips',
      event: 'select',
    });
    expect(state().stack[0]?.data).toEqual({ preco: 20 });
    runAction({ name: 'update_data', payload: {} }, ctx, { name: 'chips', event: 'unselect' });
    expect(state().stack[0]?.data).toEqual({ preco: 10 });
  });
});

it('ignores unknown actions', () => {
  const { ctx, host, dispatched } = ctxFor(flow);
  runAction({ name: 'nope' } as unknown as FlowAction, ctx);
  expect(dispatched).toEqual([]);
  expect(host.submit).not.toHaveBeenCalled();
});

describe('buildSummary', () => {
  const rich = {
    version: '7.0',
    screens: [
      screenOf('A', [
        { type: 'TextInput', name: 'nome', label: 'Nome' },
        { type: 'TextInput', name: 'senha', label: 'Senha', sensitive: true },
        { type: 'OptIn', name: 'aceite', label: 'Aceito os termos' },
        {
          type: 'CheckboxGroup',
          name: 'cob',
          label: 'Coberturas',
          'data-source': [
            { id: 'r', title: 'Roubo' },
            { id: 'v', title: 'Vidros' },
          ],
        },
        { type: 'DocumentPicker', name: 'doc', label: 'Documento' },
        { type: 'TextInput', name: 'dyn', label: '${data.label}' },
      ]),
      screenOf('S', [{ type: 'TextInput', name: 'cartao', label: 'Cartão' }], {
        sensitive: true,
      }),
    ],
  } as unknown as FlowJson;

  it('formats booleans, options, arrays, media and unknown keys', () => {
    const summary = buildSummary(rich, {
      nome: 'Ana\nMaria',
      aceite: true,
      recusa: false,
      cob: ['r', 'v', 'x'],
      doc: [{ media_id: 'local-1', file_name: 'rg.pdf' }],
      dyn: 'v',
      vazio: '',
      nada: null,
      idade: 30,
    });
    expect(summary).toBe(
      [
        'Nome: Ana Maria',
        'Aceito os termos: Sim',
        'recusa: Não',
        'Coberturas: Roubo, Vidros, x',
        'Documento: rg.pdf',
        'dyn: v',
        'idade: 30',
      ].join('\n'),
    );
  });

  it('includes a CalendarPicker range as "start a end"', () => {
    const ranged = {
      version: '7.0',
      screens: [
        screenOf('A', [
          { type: 'CalendarPicker', name: 'periodo', label: 'Período', mode: 'range' },
        ]),
      ],
    } as unknown as FlowJson;
    expect(
      buildSummary(ranged, { periodo: { 'start-date': '2027-02-01', 'end-date': '2027-02-10' } }),
    ).toBe('Período: 2027-02-01 a 2027-02-10');
    expect(buildSummary(ranged, { periodo: { 'start-date': '2027-02-01' } })).toBe(
      'Período: 2027-02-01',
    );
  });

  it('masks component-level and screen-level sensitive fields', () => {
    const summary = buildSummary(rich, { senha: 's3cr3t', cartao: '4111', nome: 'Ana' });
    expect(summary).toBe('Senha: ••••\nCartão: ••••\nNome: Ana');
    expect(summary).not.toContain('s3cr3t');
    expect(summary).not.toContain('4111');
  });

  it('masks a sensitive value submitted under another key', () => {
    const summary = buildSummary(
      rich,
      { copia: 'xx s3cr3t yy', nome: 'Ana' },
      { senha: 's3cr3t', nome: 'Ana' },
    );
    expect(summary).not.toContain('s3cr3t');
    expect(summary).toBe('copia: ••••\nNome: Ana');
  });

  it('is at most 500 characters, truncated with an ellipsis', () => {
    const summary = buildSummary(rich, { nome: 'a'.repeat(2000) });
    expect(summary.length).toBeLessThanOrEqual(500);
    expect(summary.endsWith('…')).toBe(true);
  });

  it('does not split an emoji when truncating', () => {
    const summary = buildSummary(rich, { nome: `${'a'.repeat(492)}😀😀😀` });
    expect(summary).toBe(`Nome: ${'a'.repeat(492)}…`);
  });

  it('does not read prototype keys', () => {
    const summary = buildSummary(rich, JSON.parse('{"constructor":"c","__proto__":"p"}'));
    expect(summary).toBe('constructor: c\n__proto__: p');
  });
});

describe('useFlowRuntime', () => {
  const chips = {
    version: '7.0',
    screens: [
      screenOf(
        'A',
        [
          {
            type: 'ChipsSelector',
            name: 'cob',
            label: 'Coberturas',
            'data-source': [{ id: 'r', title: 'Roubo' }],
          },
          {
            type: 'Footer',
            label: 'Ok',
            'on-click-action': { name: 'complete', payload: { cob: '${form.cob}' } },
          },
        ],
        { terminal: true },
      ),
    ],
  } as unknown as FlowJson;

  /** Same tick as ChipsSelector: dispatch `set`, then run an action. */
  function Probe({ host }: { host: FlowHost }) {
    const rt = useFlowRuntime(chips, 'f1', host);
    return (
      <button
        type="button"
        onClick={() => {
          rt.dispatch({ type: 'set', name: 'cob', value: ['r'] });
          rt.runAction({ name: 'complete', payload: { cob: '${form.cob}' } });
        }}
      >
        go
      </button>
    );
  }

  it('runAction reads the state set in the same tick', async () => {
    const host = fakeHost();
    render(
      <StrictMode>
        <Probe host={host} />
      </StrictMode>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(host.submit).toHaveBeenCalledTimes(1);
    expect(host.submit).toHaveBeenCalledWith('f1', { cob: ['r'] }, 'Coberturas: Roubo');
    expect(host.close).toHaveBeenCalledTimes(1);
  });

  it('exposes state and getState in sync and uses the latest host', () => {
    const first = fakeHost();
    const second = fakeHost();
    const { result, rerender } = renderHook(({ host }) => useFlowRuntime(chips, 'f1', host), {
      initialProps: { host: first as FlowHost },
      wrapper: StrictMode,
    });
    const { runAction: stable } = result.current;
    rerender({ host: second });
    expect(result.current.runAction).toBe(stable);
    act(() => result.current.dispatch({ type: 'set', name: 'cob', value: ['r'] }));
    expect(result.current.state.form).toEqual({ cob: ['r'] });
    expect(result.current.getState()).toBe(result.current.state);
    act(() => result.current.runAction({ name: 'complete', payload: {} }));
    expect(first.submit).not.toHaveBeenCalled();
    expect(second.submit).toHaveBeenCalledTimes(1);
  });

  it('starts from the initial data', () => {
    const { result } = renderHook(() => useFlowRuntime(chips, 'f1', fakeHost(), { a: 1 }));
    expect(result.current.state.stack[0]?.data).toEqual({ a: 1 });
  });
});
