import { afterEach, expect, it } from 'vitest';
import { MockAssistance } from './infra/mock-assistance';
import { canonicalInitialDependents } from './infra/assistance-fixtures';
import type { AssistancePort } from './application/ports';
import {
  choiceReq,
  findEvent,
  flowSubmitReq,
  startChatbot,
  textReq,
  textsOf,
  turn,
  voiceReq,
  type RunningChatbot,
} from './test/harness';

let bot: RunningChatbot;
afterEach(async () => {
  await bot?.close();
});
const readContext = { correlationId: 'assert-state', idempotencyKey: 'assert-state' };

it.each([false, true])(
  'confirms only a compatible selected modality (has dependents: %s)',
  async (hasDependents) => {
    const mock = new MockAssistance({
      capacity: 8,
      ttlMs: 60_000,
      initialDependents: hasDependents ? canonicalInitialDependents : [],
    });
    bot = await startChatbot({ overrides: { assistance: mock } });
    const session = 'selected-modality';
    await identify(session);
    await turn(bot.url, textReq('Quero uma opção mais barata.', { session }));
    await turn(bot.url, flowSubmitReq({ choice: '0' }, { session, flowId: 'PLA-02' }));
    await turn(bot.url, textReq('Os participantes estão compatíveis.', { session }));
    expect(bot.screenId(session)).toBe('PLA-06');
    const before = await mock.getSessionSnapshot(session, readContext);
    expect(before.ok && before.value.contract.modality).toBe('familiar');
    const request = flowSubmitReq({}, { session, flowId: 'PLA-06' });
    await turn(bot.url, request);
    expect(bot.screenId(session)).toBe(hasDependents ? 'PLA-06' : 'PLA-08');
    await turn(bot.url, request);
    const after = await mock.getSessionSnapshot(session, readContext);
    expect(after.ok && after.value.contract.modality).toBe(
      hasDependents ? 'familiar' : 'individual',
    );
  },
);

it('does not expose legacy insurance screens from the active assistance conversation', async () => {
  bot = await startChatbot();
  await turn(bot.url, textReq('Oi'));
  const result = await turn(bot.url, textReq('quero cotar meu carro'));
  expect(
    result.events.some(
      (event) => event.type === 'message.flow' && event.payload.flowId === 'cotacao',
    ),
  ).toBe(false);
  expect(textsOf(result.events)).toContain('opções disponíveis');
  expect(
    findEvent(result.events, 'message.quick_replies').payload.options.map((option) => option.title),
  ).toEqual(['Conhecer produtos', 'Meu contrato', 'Falar com uma pessoa']);
  expect(bot.fake.requests).toEqual([]);
});

it.each([
  [
    'João da Silva',
    'Oi, quero incluir meu filho João da Silva no plano. O CPF dele é 123.456.789-10 e ele nasceu em 12/03/2004.',
    '12345678910',
    '2004-03-12',
    'filho',
  ],
  [
    'Ana Lima',
    'Quero incluir minha filha Ana Lima no plano. O CPF dela é 987.654.321-00 e ela nasceu em 20/05/2012.',
    '98765432100',
    '2012-05-20',
    'filha',
  ],
])(
  'preserves the single statement for %s through the CPF gate without repeating it',
  async (name, statement, cpf, birthDate, relationship) => {
    const mock = new MockAssistance({ capacity: 8, ttlMs: 60_000 });
    bot = await startChatbot({ overrides: { assistance: mock } });
    const session = 'single-statement';
    const gated = await turn(bot.url, textReq(statement, { session }));
    expect(textsOf(gated.events)).toContain('11 dígitos');
    expect(textsOf(gated.events)).not.toContain(name);
    await turn(bot.url, choiceReq('IDE-08', { session }));
    const resumed = await turn(
      bot.url,
      flowSubmitReq({ cpf: '11111111111' }, { session, flowId: 'IDE-08' }),
    );
    expect(textsOf(resumed.events)).toContain(name);
    const supplement = await turn(bot.url, choiceReq('DEP-34', { session }));
    const supplementFlow = findEvent(supplement.events, 'message.flow').payload;
    expect(supplementFlow.body).toContain(name.split(' ')[0]);
    expect(JSON.stringify(supplementFlow.flowJson)).toContain(name.split(' ')[0]);
    await turn(
      bot.url,
      flowSubmitReq(
        { phone: '11987654321', biologicalSex: 'Prefiro não informar' },
        { session, flowId: 'DEP-34' },
      ),
    );
    await turn(bot.url, flowSubmitReq({}, { session, flowId: 'DEP-06' }));
    const snapshot = await mock.getSessionSnapshot(session, readContext);
    expect(snapshot.ok && snapshot.value.dependents).toEqual([
      expect.objectContaining({
        name,
        cpf,
        birthDate,
        relationship,
        phone: '11987654321',
        biologicalSex: 'not_informed',
      }),
    ]);
    expect(bot.fake.requests).toEqual([]);
  },
);

async function identify(session: string) {
  const initial = await turn(bot.url, textReq('Quero ver meu contrato.', { session }));
  expect(textsOf(initial.events)).toContain('11 dígitos');
  expect(initial.events.some((event) => event.type === 'message.flow')).toBe(false);
  await turn(bot.url, choiceReq('IDE-08', { session }));
  const accepted = await turn(
    bot.url,
    flowSubmitReq({ cpf: '11111111111' }, { session, flowId: 'IDE-08' }),
  );
  expect(findEvent(accepted.events, 'message.flow').payload.flowId).toBe('CON-01');
}

it('excludes the selected session dependent only after its actual review is confirmed', async () => {
  const mock = new MockAssistance({ capacity: 8, ttlMs: 60_000 });
  bot = await startChatbot({ overrides: { assistance: mock } });
  const session = 'remove-selected';
  await identify(session);
  await turn(
    bot.url,
    textReq(
      'Quero incluir minha filha Ana Lima no plano. O CPF dela é 987.654.321-00 e ela nasceu em 20/05/2012.',
      { session },
    ),
  );
  await turn(bot.url, choiceReq('DEP-34', { session }));
  await turn(
    bot.url,
    flowSubmitReq(
      { phone: '11987654321', biologicalSex: 'Prefiro não informar' },
      { session, flowId: 'DEP-34' },
    ),
  );
  await turn(bot.url, flowSubmitReq({}, { session, flowId: 'DEP-06' }));
  const list = await turn(bot.url, textReq('Quero excluir a Maria.', { session }));
  const json = JSON.stringify(findEvent(list.events, 'message.flow').payload.flowJson);
  expect(json).toContain('Ana Lima');
  expect(json).not.toContain('Maria Silva');
  expect(json).not.toContain('98765432100');
  const invalid = await turn(
    bot.url,
    flowSubmitReq({ choice: '99' }, { session, flowId: 'EXC-01' }),
  );
  const retryJson = JSON.stringify(findEvent(invalid.events, 'message.flow').payload.flowJson);
  expect(retryJson).toContain('Ana Lima');
  expect(retryJson).not.toContain('Maria Silva');
  await turn(bot.url, flowSubmitReq({ choice: '0' }, { session, flowId: 'EXC-01' }));
  const review = await turn(bot.url, choiceReq('EXC-03', { session }));
  expect(JSON.stringify(findEvent(review.events, 'message.flow').payload.flowJson)).toContain(
    'Ana Lima',
  );
  const before = await mock.getSessionSnapshot(session, readContext);
  expect(before.ok && before.value.dependents).toHaveLength(1);
  const confirmation = flowSubmitReq({}, { session, flowId: 'EXC-03' });
  const result = await turn(bot.url, confirmation);
  expect(bot.screenId(session)).toBe('EXC-05');
  const replay = await turn(bot.url, confirmation);
  expect(replay.events).toEqual(result.events);
  const after = await mock.getSessionSnapshot(session, readContext);
  expect(after.ok && after.value.dependents).toHaveLength(1);
  expect(after.ok && after.value.dependentRemovals).toEqual([
    { dependentId: 'DEP-DEMO-1', effectiveDate: '2026-11-10', status: 'scheduled' },
  ]);
  await turn(bot.url, choiceReq('EXC-06', { session }));
  await turn(bot.url, choiceReq('EXC-08', { session }));
  await turn(bot.url, choiceReq('EXC-09', { session }));
  const undo = choiceReq('EXC-10', { session });
  const undone = await turn(bot.url, undo);
  expect((await turn(bot.url, undo)).events).toEqual(undone.events);
  const retained = await mock.getSessionSnapshot(session, readContext);
  expect(retained.ok && retained.value.dependents).toHaveLength(1);
  expect(retained.ok && retained.value.dependentRemovals?.[0]?.status).toBe('cancelled');
  expect(bot.fake.requests).toEqual([]);
});

it('hydrates the actual exclusion list when the personal request resumes after CPF', async () => {
  const mock = new MockAssistance({ capacity: 8, ttlMs: 60_000 });
  const session = 'exclusion-before-gate';
  await mock.addDependent(
    session,
    {
      confirmed: true,
      dependent: {
        name: 'Ana Lima',
        cpf: '98765432100',
        birthDate: '2012-05-20',
        relationship: 'filha',
        phone: '11999999999',
        biologicalSex: 'not_informed',
      },
    },
    { correlationId: 'fixture', idempotencyKey: 'fixture' },
  );
  bot = await startChatbot({ overrides: { assistance: mock } });
  const gate = await turn(bot.url, textReq('Quero excluir a Maria.', { session }));
  expect(JSON.stringify(gate.events)).not.toContain('Ana Lima');
  await turn(bot.url, choiceReq('IDE-08', { session }));
  const resumed = await turn(
    bot.url,
    flowSubmitReq({ cpf: '11111111111' }, { session, flowId: 'IDE-08' }),
  );
  expect(JSON.stringify(findEvent(resumed.events, 'message.flow').payload.flowJson)).toContain(
    'Ana Lima',
  );
  expect(JSON.stringify(resumed.events)).not.toContain('Maria Silva');
  await turn(bot.url, flowSubmitReq({ choice: '0' }, { session, flowId: 'EXC-01' }));
  expect(bot.screenId(session)).toBe('EXC-02');
});

it('keeps opaque participant IDs intact when resolving a selected list index', async () => {
  const mock = new MockAssistance({
    capacity: 8,
    ttlMs: 60_000,
    initialDependents: [
      {
        id: 'a,b',
        name: 'Maria Silva',
        cpf: '12345678909',
        birthDate: '2014-03-12',
        relationship: 'Filha',
        phone: '11999999999',
        biologicalSex: 'not_informed',
      },
      {
        id: 'a',
        name: 'Ana Lima',
        cpf: '98765432100',
        birthDate: '2012-05-20',
        relationship: 'Filha',
        phone: '11988888888',
        biologicalSex: 'not_informed',
      },
    ],
  });
  bot = await startChatbot({ overrides: { assistance: mock } });
  const session = 'opaque-participant-ids';
  await identify(session);
  await turn(bot.url, textReq('Quero excluir a Maria.', { session }));
  await turn(bot.url, flowSubmitReq({ choice: '0' }, { session, flowId: 'EXC-01' }));
  const review = await turn(bot.url, choiceReq('EXC-03', { session }));
  expect(JSON.stringify(findEvent(review.events, 'message.flow').payload.flowJson)).toContain(
    'Pessoa: Maria Silva',
  );
  await turn(bot.url, flowSubmitReq({}, { session, flowId: 'EXC-03' }));
  const snapshot = await mock.getSessionSnapshot(session, readContext);
  expect(snapshot.ok && snapshot.value.dependentRemovals?.[0]?.dependentId).toBe('a,b');
});

it('confirms cancellation once over HTTP, preserves it across reads and isolates another session', async () => {
  const mock = new MockAssistance({ capacity: 8, ttlMs: 60_000 });
  bot = await startChatbot({ overrides: { assistance: mock } });
  await identify('cancel-a');
  await turn(bot.url, textReq('Não quero ofertas. Quero cancelar.', { session: 'cancel-a' }));
  await turn(bot.url, choiceReq('CAN-05', { session: 'cancel-a' }));
  const before = await mock.getSessionSnapshot('cancel-a', readContext);
  expect(before.ok && before.value.contract.status).toBe('active');
  const confirmation = flowSubmitReq({}, { session: 'cancel-a', flowId: 'CAN-05' });
  const first = await turn(bot.url, confirmation);
  const replay = await turn(bot.url, confirmation);
  expect(replay.events).toEqual(first.events);
  const after = await mock.getSessionSnapshot('cancel-a', readContext);
  expect(after.ok && after.value.contract.status).toBe('cancelled');
  expect(after.ok && after.value.requests.filter((r) => r.kind === 'cancellation')).toHaveLength(1);
  await turn(bot.url, textReq('Quero ver meu contrato.', { session: 'cancel-a' }));
  await identify('cancel-b');
  const other = await mock.getSessionSnapshot('cancel-b', readContext);
  expect(other.ok && other.value.contract.status).toBe('active');
  expect(bot.fake.requests).toEqual([]);
});

it('keeps a failed confirmation pending and retries with a new event without duplicate requests', async () => {
  let unavailable = true;
  const mock = new MockAssistance({ capacity: 8, ttlMs: 60_000 });
  const assistance = new Proxy(mock, {
    get(target, property) {
      if (property === 'cancelAssistance')
        return (...args: Parameters<AssistancePort['cancelAssistance']>) =>
          unavailable
            ? Promise.resolve({ ok: false, error: 'unavailable' } as const)
            : target.cancelAssistance(...args);
      const member = Reflect.get(target, property, target);
      return typeof member === 'function' ? member.bind(target) : member;
    },
  });
  bot = await startChatbot({ overrides: { assistance } });
  await identify('retry');
  await turn(bot.url, textReq('Não quero ofertas. Quero cancelar.', { session: 'retry' }));
  await turn(bot.url, choiceReq('CAN-05', { session: 'retry' }));
  const failed = await turn(bot.url, flowSubmitReq({}, { session: 'retry', flowId: 'CAN-05' }));
  expect(textsOf(failed.events)).toContain('indisponível');
  const before = await mock.getSessionSnapshot('retry', readContext);
  expect(before.ok && before.value.contract.status).toBe('active');
  unavailable = false;
  await turn(bot.url, flowSubmitReq({}, { session: 'retry', flowId: 'CAN-05' }));
  const after = await mock.getSessionSnapshot('retry', readContext);
  expect(after.ok && after.value.contract.status).toBe('cancelled');
  expect(after.ok && after.value.requests.filter((r) => r.kind === 'cancellation')).toHaveLength(1);
});

it.each([60_000, 60_001])(
  'emits the expired gate at %i ms and refuses an old confirmation without mutation',
  async (elapsed) => {
    let now = Date.now();
    const mock = new MockAssistance({ capacity: 8, ttlMs: 60_000, now: () => now });
    bot = await startChatbot({
      env: { SESSION_TTL_SECONDS: '60' },
      overrides: { assistance: mock, now: () => now },
    });
    await identify('expired');
    now += elapsed;
    const expired = await turn(
      bot.url,
      flowSubmitReq({}, { session: 'expired', flowId: 'CAN-05' }),
    );
    expect(bot.screenId('expired')).toBe('IDE-05');
    expect(textsOf(expired.events)).toContain('sessão demonstrativa expirou');
    expect(findEvent(expired.events, 'message.quick_replies').payload.options[0]?.id).toBe(
      'IDE-08',
    );
    const snapshot = await mock.getSessionSnapshot('expired', readContext);
    expect(snapshot.ok && snapshot.value.contract.status).toBe('active');
    const restart = await turn(bot.url, textReq('Quero ver meu contrato.', { session: 'expired' }));
    expect(textsOf(restart.events)).toContain('11 dígitos');
  },
);

it('emits a single terminal CPF form without a second review or CPF in its initial data', async () => {
  bot = await startChatbot();
  await turn(bot.url, textReq('Quero ver meu contrato.'));
  const form = await turn(bot.url, choiceReq('IDE-08'));
  const flow = findEvent(form.events, 'message.flow').payload.flowJson as {
    screens: Array<{ terminal?: boolean; layout: { children: Array<Record<string, unknown>> } }>;
  };
  expect(flow.screens).toHaveLength(1);
  expect(flow.screens[0]?.terminal).toBe(true);
  expect(flow.screens[0]?.layout.children.at(-1)).toMatchObject({
    type: 'Footer',
    'on-click-action': { name: 'complete' },
  });
});

it('emits CPF receipt and format approval before resuming a protected request', async () => {
  bot = await startChatbot();
  await turn(bot.url, textReq('Quero ver meu contrato.'));
  await turn(bot.url, choiceReq('IDE-08'));
  const result = await turn(bot.url, flowSubmitReq({ cpf: '98765432100' }, { flowId: 'IDE-08' }));
  const messages = result.events
    .filter((event) => event.type === 'message.text')
    .map((event) => event.payload.text);
  expect(messages.slice(0, 2)).toEqual([
    'Recebi o CPF para validar o formato da demonstração.',
    'O formato do CPF foi aceito. Os dados seguintes pertencem a um cenário fictício.',
  ]);
  expect(findEvent(result.events, 'message.flow').payload.flowId).toBe('CON-01');
  expect(JSON.stringify(result.events)).not.toContain('98765432100');
});

it('keeps an unknown customer input in assistance instead of emitting a legacy menu', async () => {
  bot = await startChatbot();
  const initialUnknown = await turn(
    bot.url,
    textReq('texto sem intenção conhecida', { session: 'unknown-first' }),
  );
  expect(
    initialUnknown.events
      .flatMap((event) => (event.type === 'message.quick_replies' ? event.payload.options : []))
      .some((option) => option.id.startsWith('menu.')),
  ).toBe(false);
  await turn(bot.url, textReq('oi'));
  const response = await turn(bot.url, textReq('texto sem intenção conhecida'));
  const ids = response.events.flatMap((event) =>
    event.type === 'message.quick_replies' ? event.payload.options.map((option) => option.id) : [],
  );
  expect(ids.some((id) => id.startsWith('menu.'))).toBe(false);
  expect(textsOf(response.events)).toContain('opções disponíveis');
});

it('creates one human callback from offered actions and reads documents through the personal gate', async () => {
  const mock = new MockAssistance({ capacity: 8, ttlMs: 60_000 });
  bot = await startChatbot({ overrides: { assistance: mock } });
  await identify('callback');
  await turn(bot.url, textReq('Quero falar com uma pessoa.', { session: 'callback' }));
  await turn(bot.url, choiceReq('HUM-02', { session: 'callback' }));
  await turn(bot.url, choiceReq('HUM-05', { session: 'callback' }));
  const request = choiceReq('HUM-08', { session: 'callback' });
  const first = await turn(bot.url, request);
  expect((await turn(bot.url, request)).events).toEqual(first.events);
  const snapshot = await mock.getSessionSnapshot('callback', readContext);
  expect(
    snapshot.ok && snapshot.value.requests.filter((r) => r.kind === 'human_handoff'),
  ).toHaveLength(1);
  await turn(bot.url, choiceReq('HUM-08', { session: 'callback' }));
  const stale = await mock.getSessionSnapshot('callback', readContext);
  expect(stale.ok && stale.value.requests.filter((r) => r.kind === 'human_handoff')).toHaveLength(
    1,
  );
  await turn(bot.url, textReq('Quero ver meu contrato.', { session: 'callback' }));
  await turn(bot.url, flowSubmitReq({ choice: '0' }, { session: 'callback', flowId: 'CON-01' }));
  const docs = await turn(bot.url, choiceReq('CON-07', { session: 'callback' }));
  expect(findEvent(docs.events, 'message.document').payload.documents).toHaveLength(3);
  expect(findEvent(docs.events, 'message.quick_replies').payload.options).toEqual([
    { id: 'CON-02', title: 'Voltar ao contrato' },
  ]);
  const returned = await turn(bot.url, choiceReq('CON-02', { session: 'callback' }));
  expect(textsOf(returned.events)).toContain('Situação: ativa');
  expect(bot.fake.requests).toEqual([]);
});

it('routes all four explicit audio fixtures over HTTP without invoking legacy services', async () => {
  bot = await startChatbot();
  for (const [mediaId, expected] of [
    ['AUD-01', 'Recebi seu áudio'],
    ['AUD-03', 'Entendi o pedido de inclusão'],
    ['AUD-04', 'Não consegui compreender'],
    ['AUD-05', 'Estes são os dados que compreendi'],
  ]) {
    const session = `audio-${mediaId}`;
    await identify(session);
    const response = await turn(bot.url, voiceReq(18_000, { session, mediaId }));
    expect(textsOf(response.events)).toContain(expected);
  }
  expect(bot.fake.requests).toEqual([]);
});
