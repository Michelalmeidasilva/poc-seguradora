import { describe, expect, it } from 'vitest';
import cotacao from './fixtures/cotacao.flow.json';
import {
  currentScreen,
  footerDisabled,
  initRuntime,
  reduce,
  resolvePayload,
  type RuntimeEvent,
  type RuntimeState,
  scopeOf,
  screenErrors,
  unknownFormRefs,
  visibleComponents,
  visibleEntries,
} from './runtime';
import type { FlowJson, FlowScreen } from './schema';

const flow = cotacao as unknown as FlowJson;

const run = (f: FlowJson, events: RuntimeEvent[], s: RuntimeState = initRuntime(f)) =>
  events.reduce((acc, e) => reduce(f, acc, e), s);

const toDados: RuntimeEvent[] = [
  { type: 'set', name: 'produto', value: 'AUTO' },
  { type: 'navigate', screenId: 'DADOS', payload: { produto: '${form.produto}' } },
];

const autoFields: RuntimeEvent[] = [
  { type: 'set', name: 'nome', value: 'Ana' },
  { type: 'set', name: 'cpf', value: '12345678901' },
  { type: 'set', name: 'nascimento', value: '1990-05-01' },
  { type: 'set', name: 'marca', value: 'Fiat' },
  { type: 'set', name: 'modelo', value: 'Uno' },
  { type: 'set', name: 'ano', value: '2015' },
  { type: 'set', name: 'cep', value: '01001000' },
];

const autoComplete = {
  produto: '${data.produto}',
  nome: '${form.nome}',
  marca: '${form.marca}',
};

const names = (screen: FlowScreen, s: RuntimeState) =>
  visibleComponents(screen, scopeOf(s)).flatMap((c) =>
    'name' in c && typeof c.name === 'string' ? [c.name] : [],
  );

const screen = (id: string, children: unknown[], extra: Record<string, unknown> = {}) => ({
  id,
  layout: { type: 'SingleColumnLayout', children },
  ...extra,
});

describe('initRuntime', () => {
  it('starts at the entry screen with empty state', () => {
    const s = initRuntime(flow);
    expect(s).toEqual({
      stack: [{ screenId: 'PRODUTO', data: {} }],
      form: {},
      touched: {},
      pending: 'idle',
    });
    expect(currentScreen(flow, s).id).toBe('PRODUTO');
  });

  it('accepts initial data for the entry screen', () => {
    expect(initRuntime(flow, { a: 1 }).stack[0]?.data).toEqual({ a: 1 });
  });
});

describe('set and touch', () => {
  it('sets a visible field and marks touched', () => {
    const s = run(flow, [
      { type: 'set', name: 'produto', value: 'VIDA' },
      { type: 'touch', name: 'produto' },
    ]);
    expect(s.form).toEqual({ produto: 'VIDA' });
    expect(s.touched).toEqual({ produto: true });
  });

  it('ignores a name not on the current visible set', () => {
    const s0 = initRuntime(flow);
    expect(reduce(flow, s0, { type: 'set', name: 'nome', value: 'x' })).toBe(s0);
    expect(reduce(flow, s0, { type: 'touch', name: 'nome' })).toBe(s0);
  });

  it('ignores a field hidden by the Switch', () => {
    const s = run(flow, [...toDados, { type: 'set', name: 'capital', value: '10' }]);
    expect(s.form).not.toHaveProperty('capital');
  });

  it('marks the form edited on a user set, not on init-value seeding', () => {
    const seeded = run(flow, [{ type: 'set', name: 'produto', value: 'AUTO', source: 'init' }]);
    expect(seeded.form).toEqual({ produto: 'AUTO' });
    expect(seeded.edited).toBeUndefined();
    const edited = reduce(flow, seeded, { type: 'set', name: 'produto', value: 'AUTO' });
    expect(edited.edited).toBe(true);
    // stays edited, even after a later seed
    const later = run(
      flow,
      [...toDados, { type: 'set', name: 'nome', value: 'x', source: 'init' }],
      edited,
    );
    expect(later.edited).toBe(true);
  });

  it('is immutable', () => {
    const s0 = initRuntime(flow);
    const s1 = reduce(flow, s0, { type: 'set', name: 'produto', value: 'AUTO' });
    expect(s0.form).toEqual({});
    expect(s1).not.toBe(s0);
  });
});

describe('navigate and back', () => {
  it('resolves ${form.x} in the payload into the next screen data', () => {
    const s = run(flow, toDados);
    expect(s.stack.map((f) => f.screenId)).toEqual(['PRODUTO', 'DADOS']);
    expect(s.stack[1]?.data).toEqual({ produto: 'AUTO' });
    expect(currentScreen(flow, s).id).toBe('DADOS');
  });

  it('back pops, keeps form, never goes below entry', () => {
    const s1 = run(flow, [...toDados, { type: 'set', name: 'nome', value: 'Ana' }]);
    const s2 = reduce(flow, s1, { type: 'back' });
    expect(s2.stack).toEqual([{ screenId: 'PRODUTO', data: {} }]);
    expect(s2.form).toEqual({ produto: 'AUTO', nome: 'Ana' });
    const s3 = reduce(flow, s2, { type: 'back' });
    expect(s3).toBe(s2);
  });

  it('data of a screen is the payload of the last navigation into it', () => {
    const s = run(flow, [
      ...toDados,
      { type: 'back' },
      { type: 'set', name: 'produto', value: 'VIDA' },
      { type: 'navigate', screenId: 'DADOS', payload: { produto: '${form.produto}' } },
    ]);
    expect(s.stack).toEqual([
      { screenId: 'PRODUTO', data: {} },
      { screenId: 'DADOS', data: { produto: 'VIDA' } },
    ]);
    expect(names(currentScreen(flow, s), s)).toEqual(['nome', 'cpf', 'nascimento', 'capital']);
  });

  it('ignores navigation to the current screen or an unknown screen', () => {
    const s = run(flow, toDados);
    expect(reduce(flow, s, { type: 'navigate', screenId: 'DADOS', payload: {} })).toBe(s);
    expect(reduce(flow, s, { type: 'navigate', screenId: 'NOPE', payload: {} })).toBe(s);
    expect(reduce(flow, s, { type: 'navigate', screenId: '__proto__', payload: {} })).toBe(s);
  });

  it('missing values resolve to null, never "undefined"', () => {
    const s = run(flow, [
      { type: 'navigate', screenId: 'DADOS', payload: { a: '${form.produto}', b: 'x${data.q}' } },
    ]);
    expect(s.stack[1]?.data).toEqual({ a: null, b: 'x' });
  });
});

describe('Switch visibility', () => {
  it('shows only the AUTO branch fields', () => {
    const s = run(flow, toDados);
    expect(names(currentScreen(flow, s), s)).toEqual([
      'nome',
      'cpf',
      'nascimento',
      'marca',
      'modelo',
      'ano',
      'cep',
    ]);
  });

  it('shows no branch for an unknown or prototype case', () => {
    for (const produto of ['OUTRO', 'constructor', '__proto__']) {
      const s = run(flow, [{ type: 'navigate', screenId: 'DADOS', payload: { produto } }]);
      expect(names(currentScreen(flow, s), s)).toEqual(['nome', 'cpf', 'nascimento']);
    }
  });
});

describe('If and visible', () => {
  const f = {
    version: '6.2',
    screens: [
      screen('A', [
        { type: 'OptIn', name: 'more', label: 'Mais' },
        {
          type: 'If',
          condition: '${form.more}',
          then: [{ type: 'TextInput', name: 'extra', label: 'Extra', required: true }],
          else: [{ type: 'TextBody', text: 'nada' }],
        },
        { type: 'TextInput', name: 'off', label: 'Off', required: true, visible: false },
        { type: 'TextInput', name: 'dyn', label: 'Dyn', required: true, visible: '${form.more}' },
        { type: 'Footer', label: 'Ok', 'on-click-action': { name: 'complete', payload: {} } },
      ]),
    ],
  } as unknown as FlowJson;

  it('flattens If and drops visible:false', () => {
    const s0 = initRuntime(f);
    expect(names(f.screens[0]!, s0)).toEqual(['more']);
    expect(screenErrors(f, s0)).toEqual({});
    const s1 = reduce(f, s0, { type: 'set', name: 'more', value: true });
    expect(names(f.screens[0]!, s1)).toEqual(['more', 'extra', 'dyn']);
    expect(screenErrors(f, s1)).toEqual({ extra: 'Campo obrigatório', dyn: 'Campo obrigatório' });
  });

  it('an invalid condition shows the else branch', () => {
    const g = {
      version: '6.2',
      screens: [
        screen('A', [
          {
            type: 'If',
            condition: '${form.x} >',
            then: [{ type: 'TextBody', text: 'a' }],
            else: [{ type: 'TextBody', text: 'b' }],
          },
        ]),
      ],
    } as unknown as FlowJson;
    const s = initRuntime(g);
    expect(visibleComponents(g.screens[0]!, scopeOf(s))).toEqual([{ type: 'TextBody', text: 'b' }]);
  });
});

describe('screenErrors and footerDisabled', () => {
  it('footer disabled until required fields are valid', () => {
    let s = initRuntime(flow);
    expect(footerDisabled(flow, s)).toBe(true);
    expect(screenErrors(flow, s)).toEqual({ produto: 'Campo obrigatório' });
    s = run(flow, toDados, s);
    expect(footerDisabled(flow, s)).toBe(true);
    s = run(flow, autoFields, s);
    expect(screenErrors(flow, s)).toEqual({});
    expect(footerDisabled(flow, s)).toBe(false);
    s = reduce(flow, s, { type: 'set', name: 'ano', value: 'abc' });
    expect(screenErrors(flow, s)).toEqual({ ano: 'Informe um número' });
    expect(footerDisabled(flow, s)).toBe(true);
  });

  it('hidden branch fields are not in screenErrors', () => {
    const s = run(flow, [...toDados, ...autoFields]);
    const errors = screenErrors(flow, s);
    for (const hidden of ['capital', 'tipoImovel', 'valorImovel']) {
      expect(errors).not.toHaveProperty(hidden);
    }
  });

  it('footer disabled while a data_exchange is pending', () => {
    const s = run(flow, [
      { type: 'set', name: 'produto', value: 'AUTO' },
      { type: 'exchange_start' },
    ]);
    expect(s.pending).toBe('exchange');
    expect(footerDisabled(flow, s)).toBe(true);
    expect(footerDisabled(flow, reduce(flow, s, { type: 'exchange_done' }))).toBe(false);
  });

  it('footer disabled when the Footer has enabled:false', () => {
    const f = {
      version: '6.2',
      screens: [
        screen(
          'A',
          [
            {
              type: 'Footer',
              label: 'Ok',
              enabled: false,
              'on-click-action': { name: 'complete' },
            },
          ],
          { terminal: true },
        ),
      ],
    } as unknown as FlowJson;
    expect(footerDisabled(f, initRuntime(f))).toBe(true);
  });

  it('error-message can be dynamic through data', () => {
    const f = {
      version: '6.2',
      screens: [
        screen('A', [
          {
            type: 'TextInput',
            name: 'cpf',
            label: 'CPF',
            required: true,
            'error-message': '${data.msg}',
          },
        ]),
      ],
    } as unknown as FlowJson;
    expect(screenErrors(f, initRuntime(f, { msg: 'CPF obrigatório' }))).toEqual({
      cpf: 'CPF obrigatório',
    });
    expect(screenErrors(f, initRuntime(f))).toEqual({ cpf: 'Campo obrigatório' });
  });
});

describe('complete', () => {
  it('resolves the payload, including fields from an earlier screen', () => {
    const s = run(flow, [
      ...toDados,
      ...autoFields,
      {
        type: 'complete',
        payload: { ...autoComplete, first: '${form.produto}', vazio: '${form.capitalx}' },
      },
    ]);
    expect(s.outcome).toEqual({
      kind: 'complete',
      payload: { produto: 'AUTO', nome: 'Ana', marca: 'Fiat', first: 'AUTO', vazio: null },
    });
  });

  it('drops hidden branch fields from the payload', () => {
    const s = run(flow, [
      ...toDados,
      { type: 'back' },
      { type: 'set', name: 'produto', value: 'VIDA' },
      { type: 'navigate', screenId: 'DADOS', payload: { produto: '${form.produto}' } },
      { type: 'set', name: 'capital', value: '100' },
      { type: 'back' },
      { type: 'set', name: 'produto', value: 'AUTO' },
      ...toDados.slice(1),
      ...autoFields,
      {
        type: 'complete',
        payload: { ...autoComplete, capital: '${form.capital}', note: 'c=${form.capital}' },
      },
    ]);
    expect(s.form).toHaveProperty('capital', '100');
    expect(s.outcome?.payload).toEqual({ produto: 'AUTO', nome: 'Ana', marca: 'Fiat', note: 'c=' });
  });

  it('a duplicate complete is ignored', () => {
    const s1 = run(flow, [...toDados, ...autoFields, { type: 'complete', payload: autoComplete }]);
    const s2 = reduce(flow, s1, { type: 'complete', payload: { other: 1 } });
    expect(s2).toBe(s1);
    expect(reduce(flow, s1, { type: 'set', name: 'nome', value: 'Bia' })).toBe(s1);
    expect(reduce(flow, s1, { type: 'back' })).toBe(s1);
  });

  it('user-typed expressions are not re-evaluated', () => {
    const s = run(flow, [
      ...toDados,
      { type: 'set', name: 'nome', value: '${data.produto}' },
      { type: 'complete', payload: { nome: '${form.nome}' } },
    ]);
    expect(s.outcome?.payload).toEqual({ nome: '${data.produto}' });
  });

  it('resolves a raw payload exactly once, matching resolvePayload', () => {
    const raw = { nome: 'Sr. ${form.nome}', cpf: '${form.cpf}', p: '${data.produto}' };
    const s = run(flow, [
      ...toDados,
      { type: 'set', name: 'nome', value: '${form.cpf} ${data.produto}' },
      { type: 'set', name: 'cpf', value: '${data.x}' },
    ]);
    const expected = { nome: 'Sr. ${form.cpf} ${data.produto}', cpf: '${data.x}', p: 'AUTO' };
    expect(resolvePayload(flow, s, raw)).toEqual(expected);
    expect(reduce(flow, s, { type: 'complete', payload: raw }).outcome?.payload).toEqual(expected);
    const s2 = reduce(flow, s, { type: 'update_data', patch: { eco: '${form.cpf}' } });
    expect(s2.stack[1]?.data).toEqual({ produto: 'AUTO', eco: '${data.x}' });
  });
});

describe('hidden fields across screens', () => {
  const f = {
    version: '6.2',
    screens: [
      screen('A', [
        {
          type: 'RadioButtonsGroup',
          name: 'produto',
          label: 'P',
          'data-source': [
            { id: 'AUTO', title: 'Auto' },
            { id: 'VIDA', title: 'Vida' },
          ],
        },
        { type: 'TextInput', name: 'obs', label: 'Obs' },
        {
          type: 'Footer',
          label: 'Ok',
          'on-click-action': {
            name: 'navigate',
            next: { type: 'screen', name: 'B' },
            payload: { produto: '${form.produto}' },
          },
        },
      ]),
      screen('B', [
        {
          type: 'Switch',
          value: '${data.produto}',
          cases: {
            AUTO: [{ type: 'TextInput', name: 'marca', label: 'Marca' }],
            VIDA: [{ type: 'TextInput', name: 'capital', label: 'Capital' }],
          },
        },
        {
          type: 'Footer',
          label: 'Ok',
          'on-click-action': { name: 'navigate', next: { type: 'screen', name: 'C' }, payload: {} },
        },
      ]),
      screen(
        'C',
        [
          { type: 'TextInput', name: 'obs', label: 'Obs', visible: false },
          {
            type: 'Footer',
            label: 'Ok',
            'on-click-action': { name: 'complete', payload: {} },
          },
        ],
        { terminal: true },
      ),
    ],
  } as unknown as FlowJson;
  const toB: RuntimeEvent = {
    type: 'navigate',
    screenId: 'B',
    payload: { produto: '${form.produto}' },
  };
  const toC: RuntimeEvent = { type: 'navigate', screenId: 'C', payload: {} };
  const payload = { capital: '${form.capital}', marca: '${form.marca}', obs: '${form.obs}' };

  it('a stale value from a branch left behind on an earlier screen is not submitted', () => {
    const s = run(f, [
      { type: 'set', name: 'produto', value: 'VIDA' },
      toB,
      { type: 'set', name: 'capital', value: '100' },
      { type: 'back' },
      { type: 'set', name: 'produto', value: 'AUTO' },
      toB,
      { type: 'set', name: 'marca', value: 'Fiat' },
      toC,
      { type: 'complete', payload: { ...payload, txt: 'c=${form.capital}' } },
    ]);
    expect(s.form).toHaveProperty('capital', '100');
    expect(s.outcome?.payload).toEqual({ marca: 'Fiat', obs: null, txt: 'c=' });
  });

  it('a field hidden on the current screen but visible on an earlier one is submitted', () => {
    const s = run(f, [
      { type: 'set', name: 'produto', value: 'AUTO' },
      { type: 'set', name: 'obs', value: 'nota' },
      toB,
      toC,
      { type: 'complete', payload },
    ]);
    expect(s.outcome?.payload).toEqual({ marca: null, obs: 'nota' });
  });
});

describe('update_data', () => {
  it('merges the resolved patch into the current screen data', () => {
    const s = run(flow, [
      ...toDados,
      { type: 'set', name: 'nome', value: 'Ana' },
      { type: 'update_data', patch: { saudacao: 'Oi ${form.nome}' } },
    ]);
    expect(s.stack[1]?.data).toEqual({ produto: 'AUTO', saudacao: 'Oi Ana' });
    expect(s.stack[0]?.data).toEqual({});
  });

  describe('undo by name (on-unselect-action)', () => {
    const f = {
      version: '6.2',
      screens: [
        screen('A', [{ type: 'TextInput', name: 'x', label: 'X' }], { data: {} }),
        screen('B', [{ type: 'TextInput', name: 'y', label: 'Y' }], { terminal: true }),
      ],
    } as unknown as FlowJson;
    const start = (data: Record<string, unknown>) => initRuntime(f, data);

    it('restores the values a recorded patch replaced, and removes keys it added', () => {
      const s = run(
        f,
        [
          {
            type: 'update_data',
            patch: { preco: 20, extra: true },
            undo: { name: 'chips', mode: 'record' },
          },
          { type: 'update_data', patch: {}, undo: { name: 'chips', mode: 'restore' } },
        ],
        start({ preco: 10 }),
      );
      expect(s.stack[0]?.data).toEqual({ preco: 10 });
    });

    it('keeps the first baseline when the same name records twice', () => {
      const rec = { name: 'chips', mode: 'record' } as const;
      const s = run(
        f,
        [
          { type: 'update_data', patch: { preco: 20 }, undo: rec },
          { type: 'update_data', patch: { preco: 30 }, undo: rec },
          { type: 'update_data', patch: {}, undo: { name: 'chips', mode: 'restore' } },
        ],
        start({ preco: 10 }),
      );
      expect(s.stack[0]?.data).toEqual({ preco: 10 });
    });

    it('applies the unselect patch over the restored values', () => {
      const s = run(
        f,
        [
          { type: 'update_data', patch: { preco: 20 }, undo: { name: 'c', mode: 'record' } },
          { type: 'update_data', patch: { msg: 'off' }, undo: { name: 'c', mode: 'restore' } },
        ],
        start({ preco: 10 }),
      );
      expect(s.stack[0]?.data).toEqual({ preco: 10, msg: 'off' });
    });

    it('a restore without a record only merges its patch; other names are independent', () => {
      const s = run(
        f,
        [
          { type: 'update_data', patch: { a: 1 }, undo: { name: 'one', mode: 'record' } },
          { type: 'update_data', patch: { b: 2 }, undo: { name: 'two', mode: 'restore' } },
        ],
        start({}),
      );
      expect(s.stack[0]?.data).toEqual({ a: 1, b: 2 });
    });

    it('forgets the undo entries when the screen changes', () => {
      const s = run(
        f,
        [
          { type: 'update_data', patch: { a: 1 }, undo: { name: 'n', mode: 'record' } },
          { type: 'navigate', screenId: 'B', payload: {} },
          { type: 'back' },
          { type: 'update_data', patch: {}, undo: { name: 'n', mode: 'restore' } },
        ],
        start({}),
      );
      expect(s.stack[0]?.data).toEqual({ a: 1 });
    });

    it('treats hostile names and keys as plain data', () => {
      const s = run(
        f,
        [
          {
            type: 'update_data',
            patch: JSON.parse('{"__proto__": {"polluted": 1}}') as Record<string, unknown>,
            undo: { name: '__proto__', mode: 'record' },
          },
          { type: 'update_data', patch: {}, undo: { name: '__proto__', mode: 'restore' } },
        ],
        start({}),
      );
      expect(s.stack[0]?.data).toEqual({});
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });
  });
});

describe('prototype safety', () => {
  const f = {
    version: '6.2',
    screens: [
      screen('A', [
        { type: 'TextInput', name: '__proto__', label: 'P' },
        { type: 'TextInput', name: 'constructor', label: 'C', required: true },
        {
          type: 'Footer',
          label: 'Ok',
          'on-click-action': {
            name: 'complete',
            payload: { p: '${form.__proto__}', c: '${form.constructor}' },
          },
        },
      ]),
    ],
  } as unknown as FlowJson;

  it('stores __proto__ as plain data and never pollutes', () => {
    const s0 = initRuntime(f);
    expect(screenErrors(f, s0)).toEqual({ constructor: 'Campo obrigatório' });
    const s = run(f, [
      { type: 'set', name: '__proto__', value: { polluted: true } },
      { type: 'set', name: 'constructor', value: 'c' },
      { type: 'touch', name: '__proto__' },
    ]);
    expect(Object.getPrototypeOf(s.form)).toBe(Object.prototype);
    expect(s.form.__proto__).toEqual({ polluted: true });
    expect(screenErrors(f, s)).toEqual({ ['__proto__']: 'Valor inválido' });
    const s2 = reduce(f, s, { type: 'set', name: '__proto__', value: 'p' });
    expect(Object.hasOwn(s.form, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(s.form)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.hasOwn(s.touched, '__proto__')).toBe(true);
    expect(screenErrors(f, s2)).toEqual({});
    expect(
      reduce(f, s2, { type: 'complete', payload: { p: '${form.__proto__}' } }).outcome,
    ).toEqual({
      kind: 'complete',
      payload: { p: 'p' },
    });
  });

  it('update_data with a __proto__ key stays plain data', () => {
    const s = reduce(f, initRuntime(f), {
      type: 'update_data',
      patch: JSON.parse('{"__proto__": {"x": 1}}') as Record<string, unknown>,
    });
    const data = s.stack[0]!.data;
    expect(Object.hasOwn(data, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(data)).toBe(Object.prototype);
  });
});

describe('resolvePayload', () => {
  it('is exported for data_exchange and resolves against the current screen', () => {
    const s = run(flow, [...toDados, { type: 'set', name: 'nome', value: 'Ana' }]);
    expect(resolvePayload(flow, s, { n: '${form.nome}', p: '${data.produto}' })).toEqual({
      n: 'Ana',
      p: 'AUTO',
    });
    expect(resolvePayload(flow, s, null as unknown as Record<string, unknown>)).toEqual({});
  });
});

describe('unknownFormRefs', () => {
  it('is empty for the cotacao fixture', () => {
    expect(unknownFormRefs(flow)).toEqual([]);
  });

  it('lists ${form.x} not declared on any screen', () => {
    const f = {
      version: '6.2',
      screens: [
        screen('A', [
          { type: 'TextInput', name: 'a', label: 'A' },
          { type: 'TextBody', text: 'Oi ${form.ghost} ${form.a}' },
          {
            type: 'Footer',
            label: 'Ok',
            'on-click-action': { name: 'complete', payload: { x: '${form.other.deep}' } },
          },
        ]),
      ],
    } as unknown as FlowJson;
    expect(unknownFormRefs(f)).toEqual(['ghost', 'other']);
  });
});

describe('totality', () => {
  it('currentScreen falls back to the entry screen for an unknown id', () => {
    const s: RuntimeState = { ...initRuntime(flow), stack: [{ screenId: 'X', data: {} }] };
    expect(currentScreen(flow, s).id).toBe('PRODUTO');
  });

  it('ignores malformed events', () => {
    const s0 = initRuntime(flow);
    expect(reduce(flow, s0, { type: 'nope' } as unknown as RuntimeEvent)).toBe(s0);
    expect(reduce(flow, s0, { type: 'set', name: 1 } as unknown as RuntimeEvent)).toBe(s0);
  });
});

describe('visibleEntries', () => {
  it('gives each leaf its structural path', () => {
    const screen = {
      id: 'A',
      layout: {
        type: 'SingleColumnLayout',
        children: [
          { type: 'TextBody', text: 'a' },
          { type: 'If', condition: '${data.ok}', then: [{ type: 'TextBody', text: 'b' }] },
          { type: 'Switch', value: '${data.k}', cases: { X: [{ type: 'TextBody', text: 'c' }] } },
        ],
      },
    } as unknown as FlowScreen;
    const paths = visibleEntries(screen, { data: { ok: true, k: 'X' }, form: {} }).map(
      (e) => e.path,
    );
    expect(paths).toEqual(['children[0]', 'children[1].then[0]', 'children[2].cases.X[0]']);
  });
});
