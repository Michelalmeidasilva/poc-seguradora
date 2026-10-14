import { ok } from '@seguradora/protocol';
import { describe, expect, it } from 'vitest';
import { IDLE, next, type DialogState, type ServiceCall } from '../domain/dialog';
import type { ClaimType } from '../domain/models';
import { drive, type Fakes } from '../test/drive';
import { aClaim, aClaimOpened, aPolicy, aPolicySummary, aQuote } from '../test/fixtures';
import { MockLlmProvider } from './mock-llm-provider';
import { assistanceCatalog } from '../domain/assistance-catalog';
import { runAssistanceTurn } from '../application/assistance-turn';
import { MockAssistance } from './mock-assistance';

/**
 * Dialog tests that classify the typed text with the real mock LLM (instead of hand-made
 * intents), so keyword rules that collide with a step's expected input are caught.
 */
const llm = new MockLlmProvider();
const ctx = { today: '2026-10-10' };

const typed = async (state: DialogState, text: string, fakes: Fakes = {}) =>
  drive(next(state, { kind: 'text', text, intent: await llm.classify(text) }, ctx), fakes);

const describing: DialogState = {
  name: 'claim.awaiting_description',
  apolice: 'AP-1001',
  tipo: 'COLISAO',
};

describe('claim description with the real classifier', () => {
  it.each([
    'Ao voltar do trabalho bati o carro no poste',
    'Tive que sair da pista e bati',
    'Preciso sair daqui e parar o carro, depois voltar',
  ])('accepts %j as the description', async (text) => {
    const { calls } = await typed(describing, text, { openClaim: ok(aClaimOpened()) });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.op === 'openClaim' && calls[0].request.descricao).toBe(text);
  });

  it.each(['cancelar', '  Cancelar ', 'CANCELAR', 'cancela'])('%j cancels', async (text) => {
    const { final, calls } = await typed(describing, text);
    expect(calls).toHaveLength(0);
    expect(final.state).toEqual(IDLE);
  });
});

describe('typed policy numbers at a list prompt', () => {
  const numeros = ['AP-1001', 'AP-1005'];

  it.each(['AP-1001', 'ap1001', 'a apólice AP-1001'])(
    '%j selects the policy for the claim',
    async (text) => {
      const { final, calls } = await typed({ name: 'claim.awaiting_policy', numeros }, text);
      expect(calls).toHaveLength(0);
      expect(final.state).toEqual({ name: 'claim.awaiting_type', apolice: 'AP-1001' });
    },
  );

  it.each(['AP-1001', 'ap1001', 'a apólice AP-1001'])(
    '%j views the listed policy',
    async (text) => {
      const { calls } = await typed({ name: 'policies.awaiting_choice', numeros }, text, {
        getPolicy: ok(aPolicy()),
      });
      expect(calls.map((c) => c.op === 'getPolicy' && c.numero)).toEqual(['AP-1001']);
    },
  );

  it('a number outside the list keeps the global behaviour (shows that policy)', async () => {
    const { calls } = await typed({ name: 'claim.awaiting_policy', numeros }, 'AP-2002', {
      getPolicy: ok(aPolicy({ numero: 'AP-2002' })),
    });
    expect(calls.map((c) => c.op === 'getPolicy' && c.numero)).toEqual(['AP-2002']);
  });
});

describe('typed claim type', () => {
  const choosing: DialogState = { name: 'claim.awaiting_type', apolice: 'AP-1001' };

  it.each([
    ['colisão', 'COLISAO'],
    ['Roubo', 'ROUBO'],
    ['foi um furto', 'ROUBO'],
    ['outros', 'OUTROS'],
  ] as const)('%j goes to the description as %s', async (text, tipo) => {
    const { final, calls } = await typed(choosing, text);
    expect(calls).toHaveLength(0);
    expect(final.state).toEqual({ name: 'claim.awaiting_description', apolice: 'AP-1001', tipo });
  });

  it('reprompts for an unrecognized type', async () => {
    const { final } = await typed(choosing, 'banana');
    expect(final.state).toEqual(choosing);
    expect(final.replies.some((r) => r.type === 'message.quick_replies')).toBe(true);
  });

  it('"cancelar" cancels', async () => {
    const { final } = await typed(choosing, 'cancelar');
    expect(final.state).toEqual(IDLE);
  });
});

/** Table of realistic typed messages per state that expects text. */
type Expected =
  | { state: DialogState }
  | {
      call: 'listPolicies' | 'getPolicy' | 'getClaim' | 'openClaim' | 'createQuote';
      arg: string;
      /** State after the call answered (allOk), when the journey matters. */
      then?: DialogState;
    };

const allOk: Fakes = {
  listPolicies: ok([aPolicySummary(), aPolicySummary({ numero: 'AP-1005' })]),
  getPolicy: ok(aPolicy()),
  getClaim: ok(aClaim()),
  openClaim: ok(aClaimOpened()),
  createQuote: ok(aQuote()),
};

const argOf = (c: ServiceCall): string => {
  switch (c.op) {
    case 'listPolicies':
      return c.cpf;
    case 'getPolicy':
    case 'secondCopy':
      return c.numero;
    case 'getClaim':
      return c.protocolo;
    case 'openClaim':
      return c.request.descricao;
    case 'createQuote':
      return c.request.produto;
  }
};

const awaitingFlow: DialogState = { name: 'quote.awaiting_flow' };
const listed = ['AP-1001', 'AP-1005'];
const toType = (apolice: string): DialogState => ({ name: 'claim.awaiting_type', apolice });
const toDescription = (tipo: ClaimType): DialogState => ({
  name: 'claim.awaiting_description',
  apolice: 'AP-1001',
  tipo,
});

const afterCpf = (name: 'policies.awaiting_cpf' | 'claim.awaiting_cpf'): DialogState =>
  name === 'claim.awaiting_cpf'
    ? { name: 'claim.awaiting_policy', numeros: listed }
    : { name: 'policies.awaiting_choice', numeros: listed };

const TABLE: Array<[DialogState, string, Expected]> = [
  // CPF steps
  ...(['policies.awaiting_cpf', 'claim.awaiting_cpf'] as const).flatMap(
    (name): Array<[DialogState, string, Expected]> =>
      ['meu cpf é 123.456.789-01', '12345678901', '123.456.789-01', ' 123.456.789-01. '].map(
        (t) => [{ name }, t, { call: 'listPolicies', arg: '12345678901', then: afterCpf(name) }],
      ),
  ),
  // A cpf typed with words that look like another journey still answers the step
  ...(
    [
      ['claim.awaiting_cpf', 'o cpf do meu seguro é 123.456.789-01'],
      ['claim.awaiting_cpf', 'cpf da apólice: 12345678901'],
      ['claim.awaiting_cpf', 'meu cpf é 12345678901, onde fica a agência?'],
      ['policies.awaiting_cpf', 'o cpf para a cotação é 12345678901'],
      ['policies.awaiting_cpf', 'meu cpf é 12345678901, quero abrir um sinistro depois'],
    ] as const
  ).map(([name, t]): [DialogState, string, Expected] => [
    { name },
    t,
    { call: 'listPolicies', arg: '12345678901', then: afterCpf(name) },
  ]),
  [{ name: 'claim.awaiting_cpf' }, 'cancelar', { state: IDLE }],
  [{ name: 'policies.awaiting_cpf' }, '123', { state: { name: 'policies.awaiting_cpf' } }],
  [{ name: 'claim.awaiting_cpf' }, 'não sei', { state: { name: 'claim.awaiting_cpf' } }],
  // Lists
  [{ name: 'claim.awaiting_policy', numeros: listed }, 'AP-1005', { state: toType('AP-1005') }],
  [
    { name: 'claim.awaiting_policy', numeros: listed },
    'quero a ap-1005',
    { state: toType('AP-1005') },
  ],
  [
    { name: 'claim.awaiting_policy', numeros: listed },
    'a apólice AP-1001',
    { state: toType('AP-1001') },
  ],
  [
    { name: 'policies.awaiting_choice', numeros: listed },
    'AP-1005',
    { call: 'getPolicy', arg: 'AP-1005' },
  ],
  [
    { name: 'policies.awaiting_choice', numeros: listed },
    'ap1001',
    { call: 'getPolicy', arg: 'AP-1001' },
  ],
  [
    { name: 'policies.awaiting_choice', numeros: listed },
    'quero ver a apólice AP-1001',
    { call: 'getPolicy', arg: 'AP-1001' },
  ],
  // Claim type
  [toType('AP-1001'), 'colisão', { state: toDescription('COLISAO') }],
  [toType('AP-1001'), 'bati o carro', { state: toDescription('COLISAO') }],
  [toType('AP-1001'), 'Roubo', { state: toDescription('ROUBO') }],
  [toType('AP-1001'), 'roubaram meu carro', { state: toDescription('ROUBO') }],
  [toType('AP-1001'), 'foi um furto', { state: toDescription('ROUBO') }],
  [toType('AP-1001'), 'outros', { state: toDescription('OUTROS') }],
  [toType('AP-1001'), 'quero ver minhas apólices', { state: toType('AP-1001') }],
  [toType('AP-1001'), 'cancelar', { state: IDLE }],
  // Description: everything but the bare word "cancelar" is the description
  ...[
    'Ao voltar do trabalho bati o carro no poste',
    'Tive que sair da pista e bati',
    'Precisei parar o carro e outro veículo bateu atrás',
    'Não quero cancelar o seguro, só registrar que bati no portão',
    'Quero abrir um sinistro: bati na traseira de um ônibus',
    'Foi um roubo no estacionamento do mercado',
    'Qual o status do sinistro? Bati de novo',
    'O carro da apólice AP-1001 foi riscado',
    'oi',
  ].map((t): [DialogState, string, Expected] => [
    toDescription('COLISAO'),
    t,
    { call: 'openClaim', arg: t },
  ]),
  [toDescription('COLISAO'), 'Cancelar', { state: IDLE }],
  // Claim protocol
  ...['SN-2001', 'sn2001', 'o protocolo é SN-2001', 'meu sinistro é o sn-2001'].map(
    (t): [DialogState, string, Expected] => [
      { name: 'claim_status.awaiting_protocol' },
      t,
      { call: 'getClaim', arg: 'SN-2001' },
    ],
  ),
  [
    { name: 'claim_status.awaiting_protocol' },
    'o protocolo da minha apólice é SN-2001',
    { call: 'getClaim', arg: 'SN-2001' },
  ],
  [
    { name: 'claim_status.awaiting_protocol' },
    'não lembro',
    { state: { name: 'claim_status.awaiting_protocol' } },
  ],
  // Pending Flow: random text re-sends the Flow
  [awaitingFlow, 'não consegui abrir', { state: awaitingFlow }],
  [awaitingFlow, 'e agora?', { state: awaitingFlow }],
  [awaitingFlow, 'asdfgh', { state: awaitingFlow }],
  // Idle
  [IDLE, 'oi', { state: IDLE }],
  [IDLE, 'quero uma cotação', { state: awaitingFlow }],
  [IDLE, 'preciso da segunda via', { state: { name: 'policies.awaiting_cpf' } }],
  [IDLE, 'onde fica a agência', { state: IDLE }],
  [IDLE, 'quero abrir um sinistro', { state: { name: 'claim.awaiting_cpf' } }],
  [IDLE, 'status do sinistro SN-2001', { call: 'getClaim', arg: 'SN-2001' }],
  [IDLE, 'minhas apólices, cpf 123.456.789-01', { call: 'listPolicies', arg: '12345678901' }],
];

describe('typed journeys (real classifier)', () => {
  it.each(TABLE)('in %o, %j', async (state, text, expected) => {
    const { final, calls } = await typed(state, text, allOk);
    if ('call' in expected) {
      expect(calls[0] && [calls[0].op, argOf(calls[0])]).toEqual([expected.call, expected.arg]);
      if (expected.then) expect(final.state).toEqual(expected.then);
    } else {
      expect(calls).toHaveLength(0);
      expect(final.state).toEqual(expected.state);
    }
  });
});

describe('demo flow with the real classifier', () => {
  const flowIds = (state: DialogState, text: string) =>
    typed(state, text).then(({ final, calls }) => {
      expect(calls).toHaveLength(0);
      return {
        state: final.state,
        ids: final.replies.flatMap((r) => (r.type === 'message.flow' ? [r.payload.flowId] : [])),
      };
    });

  it.each(['demo flow', 'Demo', ' DEMO FLOW '])('%j reaches the demo Flow', async (text) => {
    expect(await flowIds(IDLE, text)).toEqual({ state: IDLE, ids: ['demo'] });
  });

  it('keeps the pending quote state when the demo is asked for', async () => {
    const pending: DialogState = { name: 'quote.awaiting_flow' };
    expect(await flowIds(pending, 'demo flow')).toEqual({ state: pending, ids: ['demo'] });
  });

  it('"demo flow" is a description inside the claim description step', async () => {
    const { calls } = await typed(describing, 'demo flow', { openClaim: ok(aClaimOpened()) });
    expect(calls[0]?.op === 'openClaim' && calls[0].request.descricao).toBe('demo flow');
  });
});

describe('public assistance service discovery', () => {
  it('traverses the catalog chooser to exactly the three approved services without a gate', async () => {
    const port = new MockAssistance({ capacity: 5, ttlMs: 60_000 });
    const context = { correlationId: 'public-discovery', idempotencyKey: 'public-discovery-event' };
    const chooser = assistanceCatalog.byId['DES-01']!;
    const choices = (chooser.flow as { choices: Array<{ label: string; target: string }> }).choices;
    expect(choices.map((choice) => choice.label).sort()).toEqual([
      'Assistência Farmácia',
      'Assistência Funeral',
      'Telemedicina',
    ]);

    for (const [index, choice] of choices.entries()) {
      let state = { journeyId: 'DES', screenId: 'DES-01', gateApproved: false };
      const transition = await runAssistanceTurn(
        {
          type: 'flow_submit',
          flowId: 'DES-01',
          data: { service: String(index), modality: 'familiar', intent: 'finish' },
        },
        {
          port,
          state,
          sessionId: `public-${choice.target}`,
          context,
        },
      );
      expect(transition.ok && transition.value.state.screenId).toBe('DES-11');
      expect(transition.ok && transition.value.state.gateApproved).toBe(false);
      expect(['DES-12', 'DES-13', 'DES-14']).toContain(choice.target);
      state = transition.ok ? transition.value.state : state;
      expect(state.screenId).toBe('DES-11');
    }
  });
});
