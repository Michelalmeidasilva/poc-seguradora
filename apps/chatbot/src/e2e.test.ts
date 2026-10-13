import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import pino from 'pino';
import type { Intent } from './domain/dialog';
import { assistanceCatalog } from './domain/assistance-catalog';
import { GuardedLlmProvider } from './infra/guarded-llm-provider';
import { MockAssistance } from './infra/mock-assistance';
import { runAssistanceTurn } from './application/assistance-turn';
import { nextAssistanceState } from './domain/assistance-journey';
import type { AssistancePort, ServicesPort } from './application/ports';

type CatalogGraph = { entries: string[]; nodes: Array<{ id: string; destinations: string[] }> };

const canonicalWindow: { EXPERIENCE?: { index: Record<string, Record<string, unknown>> } } = {};
runInNewContext(
  readFileSync(
    new URL('../../../docs/prototypes/whatsapp-experience/catalog.js', import.meta.url),
    'utf8',
  ),
  { window: canonicalWindow },
);
const canonicalSteps = canonicalWindow.EXPERIENCE!.index;

function validateCatalogGraph(graph: CatalogGraph) {
  const ids = graph.nodes.map(({ id }) => id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  const known = new Set(ids);
  const destinations = graph.nodes.flatMap((node) =>
    node.destinations.map((to) => ({ from: node.id, to })),
  );
  const duplicateDestinations = destinations
    .map(({ from, to }) => `${from}->${to}`)
    .filter((edge, index, all) => all.indexOf(edge) !== index);
  const unknownDestinations = destinations
    .filter(({ to }) => !known.has(to))
    .map(({ from, to }) => `${from}->${to}`);
  const reachable = new Set<string>();
  const pending = [...graph.entries];
  while (pending.length) {
    const id = pending.pop()!;
    if (reachable.has(id) || !known.has(id)) continue;
    reachable.add(id);
    pending.push(...graph.nodes.find((node) => node.id === id)!.destinations);
  }
  return {
    duplicateIds: duplicates,
    duplicateDestinations,
    unknownDestinations,
    unknownEntries: graph.entries.filter((id) => !known.has(id)),
    unreachable: ids.filter((id) => !reachable.has(id)),
  };
}
import {
  choiceReq,
  findEvent,
  flowSubmitReq,
  hasEvent,
  quickReplyIds as quickIds,
  replies,
  startChatbot,
  templateButtons,
  textReq,
  textsOf,
  turn,
  typesOf,
  voiceReq,
  type RunningChatbot,
} from './test/harness';

let bot: RunningChatbot;
afterEach(async () => {
  await bot?.close();
});

describe('chatbot end to end (fake internal services)', () => {
  it('validates graph failures instead of assuming every catalog ID is reachable', () => {
    expect(
      validateCatalogGraph({
        entries: ['A'],
        nodes: [
          { id: 'A', destinations: ['B', 'B', 'MISSING'] },
          { id: 'B', destinations: [] },
          { id: 'ORPHAN', destinations: [] },
        ],
      }),
    ).toEqual({
      duplicateIds: [],
      duplicateDestinations: ['A->B'],
      unknownDestinations: ['A->MISSING'],
      unknownEntries: [],
      unreachable: ['ORPHAN'],
    });
    expect(
      validateCatalogGraph({
        entries: ['A'],
        nodes: [
          { id: 'A', destinations: [] },
          { id: 'A', destinations: [] },
        ],
      }).duplicateIds,
    ).toEqual(['A']);
    const duplicateActionTargets = ['B', 'B'].filter(
      (target, index, all) => all.indexOf(target) !== index,
    );
    expect(duplicateActionTargets).toEqual(['B']);
  });

  it('routes every canonical assistance ID to its expected runtime content and actions', async () => {
    const port = new MockAssistance({ capacity: 8, ttlMs: 60_000 });
    const missing: string[] = [];
    const unknown: string[] = [];

    const graphNodes = assistanceCatalog.steps.map((step) => ({
      id: step.id,
      // `destinations` is the runtime catalog's normalized edge list. Raw action duplicates
      // are checked separately below because catalog construction has already collapsed them.
      destinations: [
        ...step.destinations,
        ...(typeof step.next === 'string' && !step.destinations.includes(step.next)
          ? [step.next]
          : []),
      ],
    }));
    const graph = validateCatalogGraph({
      entries: assistanceCatalog.groups.map((group) => group.steps[0]!.id),
      nodes: graphNodes,
    });
    expect(graph.duplicateIds, 'duplicate catalog node IDs').toEqual([]);
    expect(graph.duplicateDestinations, 'duplicate normalized graph edges').toEqual([]);
    expect(graph.unknownDestinations, 'destinations without runtime nodes').toEqual([]);
    expect(graph.unknownEntries, 'entry points without runtime nodes').toEqual([]);
    // Recorded baseline: these screens have no path from their group's declared entry.
    // Keep the test sensitive to drift until the catalog owners add valid edges or entry metadata.
    expect(graph.unreachable, 'unreachable screens from declared journey entries').toEqual([
      'ENT-03',
      'ENT-07',
      'IDE-04',
      'IDE-05',
      'IDE-07',
      'AUD-03',
      'AUD-04',
      'DES-09',
      'DES-11',
      'ADE-11',
      'ADE-12',
      'ADE-13',
      'PAG-07',
      'PAG-08',
      'PAG-09',
      'PAG-10',
      'CON-03',
      'CON-04',
      'CON-08',
      'CON-09',
      'CON-10',
      'DEP-15',
      'DEP-25',
      'DEP-26',
      'DEP-27',
      'DEP-28',
      'DEP-29',
      'DEP-30',
      'DEP-31',
      'DEP-32',
      'EXC-12',
      'EXC-13',
      'EXC-14',
      'PLA-12',
      'PLA-13',
      'UTI-10',
      'FUN-10',
      'COB-09',
      'COB-12',
      'COB-13',
      'COB-14',
      'CAN-11',
      'CAN-12',
      'REN-06',
      'REN-07',
      'REN-08',
      'REN-09',
      'SOL-07',
      'SOL-08',
      'HUM-06',
      'HUM-11',
      'RET-03',
      'RET-05',
      'RET-06',
      'NOT-10',
    ]);
    const duplicateNodeIds = graphNodes
      .map(({ id }) => id)
      .filter((id, index, ids) => ids.indexOf(id) !== index);
    expect(duplicateNodeIds, 'duplicate node IDs').toEqual([]);
    const duplicateActionTargets = assistanceCatalog.steps.flatMap((step) => {
      const targets = step.actions.map((action) => action.target);
      return targets
        .filter((target, index) => targets.indexOf(target) !== index)
        .map((target) => `${step.id}->${target}`);
    });
    expect(duplicateActionTargets, 'explicit action target duplicates').toEqual([
      'IDE-03->CON-02',
      'DEP-11->DEP-04',
    ]);
    const unknownActionTargets = assistanceCatalog.steps.flatMap((step) =>
      step.actions
        .filter((action) => !assistanceCatalog.byId[action.target])
        .map((action) => `${step.id}->${action.target}`),
    );
    expect(unknownActionTargets, 'action targets without runtime nodes').toEqual([]);
    for (const step of assistanceCatalog.steps) {
      const transition = nextAssistanceState(
        { journeyId: '', screenId: '', gateApproved: true },
        { type: 'open', target: step.id },
      );
      if (!assistanceCatalog.byId[transition.step.id] || transition.state.screenId !== step.id)
        unknown.push(step.id);
      if (step.journeyId !== 'IDE' && transition.step.bot !== canonicalSteps[step.id]?.bot)
        missing.push(`${step.id}: canonical content`);
      const result = await runAssistanceTurn(
        { type: 'open', target: step.id },
        {
          port,
          sessionId: 'catalog-coverage',
          context: { correlationId: `catalog-${step.id}`, idempotencyKey: `catalog-${step.id}` },
          state: { journeyId: '', screenId: '', gateApproved: true },
        },
      );
      if (!result.ok || result.value.state.screenId !== step.id) {
        missing.push(step.id);
        continue;
      }

      if (step.mode === 'document') {
        if (!result.value.replies.some((reply) => reply.type === 'message.document'))
          missing.push(`${step.id}: document`);
      } else if (step.mode === 'chat' || step.mode === 'audio') {
        if (!result.value.replies.some((reply) => reply.type === 'message.text'))
          missing.push(`${step.id}: content`);
      } else if (
        !result.value.replies.some(
          (reply) =>
            reply.type === 'message.flow' &&
            reply.payload.flowId === step.id &&
            reply.payload.body === transition.step.bot,
        )
      ) {
        missing.push(`${step.id}: flow content`);
      }
      for (const action of step.actions) {
        if (step.mode === 'document') continue;
        if (
          !result.value.replies.some(
            (reply) =>
              reply.type === 'message.quick_replies' &&
              reply.payload.options.some(
                (option) =>
                  option.id === action.target &&
                  (step.journeyId === 'IDE' ||
                    option.title ===
                      (
                        canonicalSteps[step.id] as {
                          actions: Array<{ target: string; label: string }>;
                        }
                      ).actions.find((item) => item.target === action.target)?.label),
              ),
          )
        )
          missing.push(`${step.id}: action ${action.target}`);
      }
    }

    expect({
      groups: assistanceCatalog.groups.length,
      ids: assistanceCatalog.ids.length,
      uniqueIds: new Set(assistanceCatalog.ids).size,
    }).toEqual({ groups: 24, ids: 247, uniqueIds: 247 });
    expect(unknown, `unknown runtime targets: ${unknown.join(', ')}`).toEqual([]);
    expect(missing, `unreachable or mismatched IDs: ${missing.join(', ')}`).toEqual([]);
  });

  it('serves public assistance and validates a private CPF gate over the HTTP API', async () => {
    bot = await startChatbot();

    for (const [choice, session, product] of [
      ['0', 'public-funeral', 'Assistência Funeral'],
      ['1', 'public-pharmacy', 'Assistência Farmácia'],
      ['2', 'public-telemedicine', 'Telemedicina'],
    ] as const) {
      const publicStart = await turn(bot.url, textReq('O que vocês oferecem?', { session }));
      expect(findEvent(publicStart.events, 'message.flow').payload.flowId).toBe('DES-01');
      const publicChoice = await turn(
        bot.url,
        flowSubmitReq({ choice }, { session, flowId: 'DES-01' }),
      );
      expect(textsOf(publicChoice.events)).toContain(product);
    }

    const privateStart = await turn(
      bot.url,
      textReq('Quero ver meu contrato.', { session: 'private' }),
    );
    expect(findEvent(privateStart.events, 'message.flow').payload.flowId).toBe('IDE-01');
    const cpfForm = await turn(bot.url, choiceReq('IDE-08', { session: 'private' }));
    expect(findEvent(cpfForm.events, 'message.flow').payload.flowId).toBe('IDE-08');
    const malformed = await turn(
      bot.url,
      flowSubmitReq({ cpf: '12345' }, { session: 'private', flowId: 'IDE-08' }),
    );
    expect(textsOf(malformed.events)).toContain('11 dígitos');
    await turn(bot.url, choiceReq('IDE-08', { session: 'private' }));
    const accepted = await turn(
      bot.url,
      flowSubmitReq({ cpf: '52998224725' }, { session: 'private', flowId: 'IDE-08' }),
    );
    expect(findEvent(accepted.events, 'message.flow').payload.flowId).toBe('CON-01');
    expect(
      JSON.stringify([privateStart.events, cpfForm.events, malformed.events, accepted.events]),
    ).not.toContain('52998224725');
    expect(
      bot.fake.requests.filter((request) =>
        ['/v1/cotacoes', '/v1/apolices', '/v1/sinistros'].includes(request.path),
      ),
    ).toEqual([]);
  });

  it('drives a dependent from one sentence through review, correction and confirmation over HTTP', async () => {
    const cpfCanary = '123.456.789-10';
    const logLines: string[] = [];
    const mutationCalls: string[] = [];
    const legacyServiceCalls: string[] = [];
    const mock = new MockAssistance({ capacity: 8, ttlMs: 60_000 });
    const mutationMethods = new Set([
      'addDependent',
      'updateDependent',
      'removeDependent',
      'changeModality',
      'renewAssistance',
      'updateAddress',
      'requestFuneralAssistance',
      'cancelAssistance',
      'regularizeBilling',
      'updatePreferences',
      'createRequest',
    ]);
    const assistance = new Proxy(mock, {
      get(target, property) {
        const member = Reflect.get(target, property, target) as unknown;
        if (typeof property !== 'string' || typeof member !== 'function') return member;
        return (...args: unknown[]) => {
          if (mutationMethods.has(property)) mutationCalls.push(property);
          return member.apply(target, args);
        };
      },
    }) as AssistancePort;
    const services = new Proxy({} as ServicesPort, {
      get(_target, property) {
        return async () => {
          legacyServiceCalls.push(String(property));
          return { ok: false, error: 'unavailable' } as const;
        };
      },
    });
    bot = await startChatbot({
      overrides: {
        assistance,
        services,
        logger: pino({ level: 'debug' }, { write: (line: string) => logLines.push(line) }),
      },
    });

    const session = 'dependent-correction';
    const oneSentence =
      'Oi, quero incluir meu filho João da Silva no plano. O CPF dele é 123.456.789-10 e ele nasceu em 12/03/2004.';
    const gated = await turn(bot.url, textReq(oneSentence, { session }));
    expect(findEvent(gated.events, 'message.flow').payload.flowId).toBe('IDE-01');
    await turn(bot.url, choiceReq('IDE-08', { session }));
    const acceptedCpf = await turn(
      bot.url,
      flowSubmitReq({ cpf: cpfCanary }, { session, flowId: 'IDE-08' }),
    );
    expect(textsOf(acceptedCpf.events)).not.toContain(cpfCanary);

    const captured = await turn(bot.url, textReq(oneSentence, { session }));
    expect(textsOf(captured.events)).toContain('João');
    const supplement = await turn(bot.url, choiceReq('DEP-34', { session }));
    expect(findEvent(supplement.events, 'message.flow').payload.flowId).toBe('DEP-34');
    const review = await turn(
      bot.url,
      flowSubmitReq(
        { phone: '11987654321', biologicalSex: 'Masculino' },
        { session, flowId: 'DEP-34' },
      ),
    );
    expect(findEvent(review.events, 'message.flow').payload.flowId).toBe('DEP-06');
    const correction = await turn(
      bot.url,
      flowSubmitReq({ correction: true }, { session, flowId: 'DEP-06' }),
    );
    expect(textsOf(correction.events)).toContain('corrigir');
    await turn(bot.url, choiceReq('DEP-16', { session }));
    const revised = await turn(bot.url, choiceReq('DEP-17', { session }));
    expect(findEvent(revised.events, 'message.flow').payload.flowId).toBe('DEP-17');
    const confirmed = await turn(bot.url, flowSubmitReq({}, { session, flowId: 'DEP-17' }));

    expect(textsOf(confirmed.events)).toContain('Recebi sua confirmação');
    expect(mutationCalls).toEqual(['addDependent']);
    const repliesAndLogs = JSON.stringify({
      events: [
        gated.events,
        acceptedCpf.events,
        captured.events,
        supplement.events,
        review.events,
        correction.events,
        revised.events,
        confirmed.events,
      ],
      logs: logLines,
    });
    expect(repliesAndLogs).not.toContain(cpfCanary);
    expect(legacyServiceCalls).toEqual([]);
  });

  it('answers a greeting with typing indicators, text and the main menu', async () => {
    bot = await startChatbot();
    const r = await turn(bot.url, textReq('oi'));
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/x-ndjson');
    expect(typesOf(r.events)).toEqual([
      'status.typing',
      'status.typing',
      'message.text',
      'message.quick_replies',
    ]);
    expect(quickIds(r.events)).toEqual(['DES-01', 'IDE-01', 'HUM-01']);
  });

  it('runs the policies journey: cpf, choice, detail and second copy', async () => {
    bot = await startChatbot();
    const ask = await turn(bot.url, textReq('quero ver minhas apólices'));
    expect(textsOf(ask.events)).toContain('CPF');

    const list = await turn(bot.url, textReq('123.456.789-01'));
    expect(quickIds(list.events)).toEqual(['policy:AP-1001', 'policy:AP-1002', 'policy:AP-1003']);

    const detail = await turn(bot.url, choiceReq('policy:AP-1001'));
    expect(findEvent(detail.events, 'message.template').payload.header).toBe('Apólice AP-1001');

    const copy = await turn(bot.url, choiceReq('policy.second_copy:AP-1001'));
    const copyButtons = templateButtons(findEvent(copy.events, 'message.template'));
    expect(copyButtons.map((b) => b.type)).toContain('url');

    const refused = await turn(bot.url, choiceReq('policy.second_copy:AP-1003'));
    expect(textsOf(refused.events)).toContain('cancelada');
    expect(hasEvent(refused.events, 'message.template')).toBe(false);
    const refusedJson = JSON.stringify(refused.events);
    expect(refusedJson).not.toContain('documentoUrl');
    expect(refusedJson).not.toContain('exemplo.invalid');
    expect(
      bot.fake.requests.filter((q) => q.path === '/v1/apolices/AP-1003/segunda-via'),
    ).toHaveLength(1);
  });

  it('runs the quote journey through the Flow and shows the quote', async () => {
    bot = await startChatbot();
    const start = await turn(bot.url, choiceReq('menu.quote'));
    expect(findEvent(start.events, 'message.flow').payload.flowId).toBe('cotacao');

    const done = await turn(
      bot.url,
      flowSubmitReq({
        produto: 'AUTO',
        nome: 'Maria Souza',
        cpf: '123.456.789-01',
        nascimento: '1990-05-20',
        marca: 'Fiat',
        modelo: 'Argo',
        ano: '2021',
        cep: '01310-100',
      }),
    );
    expect(typesOf(replies(done.events))).toEqual(['message.template', 'message.carousel']);
    const sent = bot.fake.requests.find((q) => q.path === '/v1/cotacoes');
    expect(sent?.body).toMatchObject({
      produto: 'AUTO',
      cliente: { cpf: '12345678901' },
      dados: { veiculo: { marca: 'Fiat', modelo: 'Argo', ano: 2021 }, cep: '01310100' },
    });
  });

  it('runs the claim journey and answers with the protocol in a code message', async () => {
    bot = await startChatbot();
    await turn(bot.url, textReq('quero abrir um sinistro'));
    const types = await turn(bot.url, textReq('12345678901'));
    expect(quickIds(types.events)).toEqual([
      'claim.type:COLISAO',
      'claim.type:ROUBO',
      'claim.type:OUTROS',
    ]);
    const asked = await turn(bot.url, choiceReq('claim.type:COLISAO'));
    expect(textsOf(asked.events)).toContain('Descreva');

    const opened = await turn(
      bot.url,
      textReq('bati o carro, colisão no estacionamento do shopping'),
    );
    expect(findEvent(opened.events, 'message.code').payload.code).toContain('SN-2002');
    const body = bot.fake.requests.find(
      (q) => q.path === '/v1/sinistros' && q.method === 'POST',
    )?.body;
    expect(body).toMatchObject({
      apoliceNumero: 'AP-1001',
      tipo: 'COLISAO',
      dataOcorrencia: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it('shows the status of an existing claim', async () => {
    bot = await startChatbot();
    const r = await turn(bot.url, textReq('qual o status do sinistro SN-2001?'));
    expect(findEvent(r.events, 'message.template').payload.header).toBe('Sinistro SN-2001');
  });

  it('answers the branch location', async () => {
    bot = await startChatbot();
    const loc = await turn(bot.url, textReq('onde fica a agência?'));
    expect(typesOf(replies(loc.events))).toEqual(['message.text', 'message.location']);
  });

  it('answers a voice message saying audio is not supported and offers the menu', async () => {
    bot = await startChatbot();
    const r = await turn(bot.url, voiceReq(4200));
    expect(textsOf(r.events)).toContain('áudio');
    expect(quickIds(r.events)).toEqual(['menu.quote', 'menu.policies', 'menu.claim']);
  });

  it('tells the user a claim was not found and returns to idle', async () => {
    bot = await startChatbot();
    const r = await turn(bot.url, textReq('status do sinistro SN-9999'));
    expect(textsOf(r.events)).toContain('Não encontrei esse sinistro');
    expect(
      bot.fake.requests.filter((q) => q.method === 'GET' && q.path === '/v1/sinistros/SN-9999'),
    ).toHaveLength(1);
    const next = await turn(bot.url, textReq('oi'));
    expect(quickIds(next.events)).toEqual(['DES-01', 'IDE-01', 'HUM-01']);
  });

  it('asks for the Flow again when the submission is invalid, without calling the service', async () => {
    bot = await startChatbot();
    await turn(bot.url, choiceReq('menu.quote'));
    const r = await turn(bot.url, flowSubmitReq({ produto: 'VIDA', nome: 'x' }));
    expect(hasEvent(r.events, 'message.text')).toBe(true);
    expect(findEvent(r.events, 'message.flow').payload.flowId).toBe('cotacao');
    expect(bot.fake.requests.filter((q) => q.path === '/v1/cotacoes')).toHaveLength(0);
  });

  it('keeps the Flow when the quote service is unavailable and succeeds on the retry', async () => {
    bot = await startChatbot({ env: { SERVICE_RETRIES: '0' } });
    const form = {
      produto: 'AUTO',
      nome: 'Maria Souza',
      cpf: '123.456.789-01',
      nascimento: '1990-05-20',
      marca: 'Fiat',
      modelo: 'Argo',
      ano: '2021',
      cep: '01310-100',
    };
    await turn(bot.url, choiceReq('menu.quote'));
    bot.fake.failNext(503, 1);
    const down = await turn(bot.url, flowSubmitReq(form));
    expect(textsOf(down.events)).toContain('Tente novamente');
    expect(findEvent(down.events, 'message.flow').payload.flowId).toBe('cotacao');

    const ok = await turn(bot.url, flowSubmitReq(form));
    expect(typesOf(replies(ok.events))).toEqual(['message.template', 'message.carousel']);
  });

  it('executes a repeated event id once and returns the same events', async () => {
    bot = await startChatbot();
    const req = textReq('minhas apólices 12345678901', {
      id: '00000000-0000-4000-8000-0000000abcde',
    });
    const first = await turn(bot.url, req);
    const second = await turn(bot.url, req);
    expect(second.events).toEqual(first.events);
    expect(bot.fake.requests.filter((q) => q.path === '/v1/apolices')).toHaveLength(1);
  });

  it('lets a repeated event id follow the turn that is still running', async () => {
    bot = await startChatbot();
    bot.fake.delayMs = 250;
    const req = textReq('minhas apólices 12345678901', {
      id: '00000000-0000-4000-8000-0000000fffff',
    });
    const [a, b] = await Promise.all([turn(bot.url, req), turn(bot.url, req)]);
    expect(b.events).toEqual(a.events);
    expect(a.events.length).toBeGreaterThan(2);
    expect(bot.fake.requests.filter((q) => q.path === '/v1/apolices')).toHaveLength(1);
  });

  it('sends the headers before a slow service answers', async () => {
    bot = await startChatbot();
    bot.fake.delayMs = 600;
    const r = await turn(bot.url, textReq('minhas apólices 12345678901'));
    expect(r.headersAfterMs).toBeLessThan(400);
    expect(r.events.length).toBeGreaterThan(2);
  });

  it('forwards the correlation id of the request to the services', async () => {
    bot = await startChatbot();
    await turn(bot.url, textReq('minhas apólices 12345678901', { corr: 'corr-e2e-42' }));
    const call = bot.fake.requests.find((q) => q.path === '/v1/apolices');
    expect(call?.headers['x-correlation-id']).toBe('corr-e2e-42');
  });

  it('puts the request session and correlation id in every event', async () => {
    bot = await startChatbot();
    const r = await turn(bot.url, textReq('oi', { session: 'sess-xyz', corr: 'corr-9' }));
    expect(r.events.every((e) => e.sessionId === 'sess-xyz' && e.correlationId === 'corr-9')).toBe(
      true,
    );
  });

  it('keeps the dialog state apart per session', async () => {
    bot = await startChatbot();
    await turn(bot.url, textReq('minhas apólices', { session: 'a' }));
    const other = await turn(bot.url, textReq('12345678901', { session: 'b' }));
    expect(textsOf(other.events)).toContain('Não entendi');
    const same = await turn(bot.url, textReq('12345678901', { session: 'a' }));
    expect(quickIds(same.events)).toEqual(['policy:AP-1001', 'policy:AP-1002', 'policy:AP-1003']);
  });

  it('degrades with a friendly message when a service is down and keeps the step', async () => {
    bot = await startChatbot({ env: { SERVICE_RETRIES: '0' } });
    await turn(bot.url, textReq('minhas apólices'));
    bot.fake.failNext(503, 1);
    const down = await turn(bot.url, textReq('12345678901'));
    expect(down.status).toBe(200);
    expect(textsOf(down.events)).toContain('Tente novamente');
    expect(down.events.some((e) => e.type === 'error')).toBe(false);

    const retry = await turn(bot.url, textReq('12345678901'));
    expect(quickIds(retry.events)).toEqual(['policy:AP-1001', 'policy:AP-1002', 'policy:AP-1003']);
  });

  it('stops calling a service once its circuit is open and still answers', async () => {
    bot = await startChatbot({
      env: { SERVICE_RETRIES: '0', BREAKER_FAILURE_THRESHOLD: '2', BREAKER_RESET_MS: '60000' },
    });
    bot.fake.failNext(503, 100);
    await turn(bot.url, textReq('minhas apólices 12345678901'));
    await turn(bot.url, textReq('minhas apólices 12345678901'));
    const hitsAtOpen = bot.fake.hits;
    expect(hitsAtOpen).toBe(2);
    const r = await turn(bot.url, textReq('minhas apólices 12345678901'));
    expect(textsOf(r.events)).toContain('Tente novamente');
    expect(bot.fake.hits).toBe(hitsAtOpen);
  });

  it('falls back to the unknown reply when the LLM is too slow', async () => {
    const slow = { classify: () => new Promise<Intent>(() => undefined) };
    const silent = {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    };
    const guarded = new GuardedLlmProvider(slow, {
      timeoutMs: 50,
      maxInputChars: 1000,
      logger: silent,
    });
    bot = await startChatbot({ overrides: { llm: guarded } });
    const started = Date.now();
    const r = await turn(bot.url, textReq('mensagem sem intenção reconhecida'));
    expect(textsOf(r.events)).toContain('Não entendi');
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('produces an empty 200 turn for a flow data exchange and rejects malformed requests', async () => {
    bot = await startChatbot();
    const exchange = await turn(bot.url, {
      v: 1,
      sessionId: 's1',
      correlationId: 'c',
      event: {
        v: 1,
        id: '00000000-0000-4000-8000-0000000ee001',
        sessionId: 's1',
        correlationId: 'c',
        ts: '2026-10-10T12:00:00.000Z',
        type: 'user.flow_data_exchange',
        payload: { flowId: 'cotacao', screen: 'X', action: 'a', data: {} },
      },
    });
    expect(exchange.status).toBe(200);
    expect(exchange.events).toEqual([]);
    const bad = await fetch(`${bot.url}/v1/chat/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(bad.status).toBe(400);
  });

  it('opens the demo Flow by typing and answers a demo data exchange with an empty NDJSON body', async () => {
    bot = await startChatbot();
    const demo = await turn(bot.url, textReq('demo flow', { session: 'demo-s' }));
    expect(findEvent(demo.events, 'message.flow').payload.flowId).toBe('demo');

    const canary = 'CANARIO-E2E-5b10';
    const request = {
      v: 1,
      sessionId: 'demo-s',
      correlationId: 'corr-exchange',
      event: {
        v: 1,
        id: '00000000-0000-4000-8000-0000000ee002',
        sessionId: 'demo-s',
        correlationId: 'corr-exchange',
        ts: '2026-10-10T12:00:00.000Z',
        type: 'user.flow_data_exchange',
        payload: {
          flowId: 'demo',
          screen: 'DADOS',
          action: 'data_exchange',
          data: { nome: canary },
        },
      },
    } as const;
    const res = await fetch(`${bot.url}/v1/chat/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' },
      body: JSON.stringify(request),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/x-ndjson');
    const body = await res.text();
    expect(body.trim()).toBe('');
    expect(body).not.toContain(canary);

    // The exchange did not disturb the dialog: a demo submission is acknowledged.
    const submitted = await turn(bot.url, {
      ...request,
      correlationId: 'corr-submit',
      event: {
        ...request.event,
        id: '00000000-0000-4000-8000-0000000ee003',
        correlationId: 'corr-submit',
        type: 'user.flow_submit',
        payload: { flowId: 'demo', data: { nome: canary } },
      },
    } as unknown as Parameters<typeof turn>[1]);
    expect(textsOf(submitted.events)).toContain('Nenhum dado foi guardado');
    expect(JSON.stringify(submitted.events)).not.toContain(canary);
  });

  it('never calls a service with a hostile identifier', async () => {
    bot = await startChatbot();
    const before = bot.fake.hits;
    await turn(bot.url, choiceReq('policy:AP-1/../../etc'));
    await turn(bot.url, choiceReq('policy.second_copy:AP-1001%2F..'));
    await turn(bot.url, textReq('status do sinistro SN-1/../x'));
    expect(bot.fake.hits).toBe(before);
  });

  it('shuts down quickly while a stream is open', async () => {
    bot = await startChatbot();
    bot.fake.delayMs = 3000;
    void fetch(`${bot.url}/v1/chat/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(textReq('minhas apólices 12345678901')),
    }).catch(() => undefined);
    const deadline = Date.now() + 2000;
    while (bot.fake.hits === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(bot.fake.hits).toBeGreaterThan(0);
    const t = Date.now();
    await bot.close();
    expect(Date.now() - t).toBeLessThan(1500);
    bot = await startChatbot();
  });
});
