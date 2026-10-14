import {
  err,
  ok,
  parseChatbotLine,
  type ChatbotRequest,
  type ClientEvent,
  type UnsequencedServerEvent,
} from '@seguradora/protocol';
import { describe, expect, it, vi } from 'vitest';
import { IDLE, type DialogState, type Intent } from '../domain/dialog';
import { TurnLog } from '../domain/turn-log';
import { aClaimOpened, aPolicy, aPolicySummary, aQuote, aSecondCopy } from '../test/fixtures';
import type { AssistanceRequest } from './assistance-service';
import { HandleTurn } from './handle-turn';
import { InMemoryAssistanceStateStore } from './assistance-turn';
import { idempotencyKeyFor } from './idempotency';
import type {
  AssistancePort,
  CallContext,
  DialogStore,
  LlmProvider,
  Logger,
  ServicesPort,
} from './ports';

const silent: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const intent = (name: Intent['name'], entities: Intent['entities'] = {}): Intent => ({
  name,
  entities,
});

const request = (
  event: Partial<ClientEvent> & { type: ClientEvent['type'] },
  id = 1,
): ChatbotRequest =>
  ({
    v: 1,
    sessionId: 's1',
    correlationId: `corr-${id}`,
    event: {
      v: 1,
      id: uuid(id),
      sessionId: 's1',
      correlationId: `corr-${id}`,
      ts: '2026-10-10T12:00:00.000Z',
      ...event,
    },
  }) as ChatbotRequest;

const inSession = (r: ChatbotRequest, sessionId: string): ChatbotRequest =>
  ({ ...r, sessionId, event: { ...r.event, sessionId } }) as ChatbotRequest;

const text = (t: string, id = 1) => request({ type: 'user.text', payload: { text: t } }, id);
const quickReply = (optionId: string, id = 1) =>
  request({ type: 'user.quick_reply', payload: { optionId, replyToId: uuid(99) } }, id);

const memoryStore = (): DialogStore & { map: Map<string, DialogState> } => {
  const map = new Map<string, DialogState>();
  return { map, get: (id) => map.get(id) ?? IDLE, set: (id, s) => void map.set(id, s) };
};

const okServices = (): { [K in keyof ServicesPort]: ReturnType<typeof vi.fn> } & ServicesPort => ({
  listPolicies: vi.fn(async () => ok([aPolicySummary()])),
  getPolicy: vi.fn(async () => ok(aPolicy())),
  secondCopy: vi.fn(async () => err('unavailable' as const)),
  createQuote: vi.fn(async () => ok(aQuote())),
  openClaim: vi.fn(async () => ok(aClaimOpened())),
  getClaim: vi.fn(async () => err('not_found' as const)),
});

const assistancePort = (requests: AssistanceRequest[] = []): AssistancePort => ({
  getSessionSnapshot: async () => err('unavailable' as const),
  listBenefits: async () => err('unavailable' as const),
  listDocuments: async () => err('unavailable' as const),
  listDependents: async () => err('unavailable' as const),
  addDependent: async () => err('unavailable' as const),
  updateDependent: async () => err('unavailable' as const),
  removeDependent: async () => err('unavailable' as const),
  cancelDependentRemoval: async () => err('unavailable' as const),
  changeModality: async () => err('unavailable' as const),
  renewAssistance: async () => err('unavailable' as const),
  updateAddress: async () => err('unavailable' as const),
  requestFuneralAssistance: async () => err('unavailable' as const),
  cancelAssistance: async () => err('unavailable' as const),
  getBilling: async () => err('unavailable' as const),
  regularizeBilling: async () => err('unavailable' as const),
  getPreferences: async () => err('unavailable' as const),
  updatePreferences: async () => err('unavailable' as const),
  listRequests: async () => ok(requests),
  createRequest: async (_sessionId, command) => {
    const created: AssistanceRequest = {
      id: `r${requests.length + 1}`,
      kind: command.kind,
      status: 'received',
      message: command.message,
    };
    requests.push(created);
    return ok(created);
  },
  getRequest: async () => err('unavailable' as const),
});

let counter = 0;
const make = (
  over: {
    llm?: LlmProvider;
    services?: ServicesPort;
    dialogs?: DialogStore;
    capacity?: number;
    now?: number;
    assistance?: AssistancePort;
    assistanceStates?: InMemoryAssistanceStateStore;
  } = {},
) => {
  const dialogs = over.dialogs ?? memoryStore();
  const services = over.services ?? okServices();
  const llm: LlmProvider = over.llm ?? { classify: async () => intent('greeting') };
  const handler = new HandleTurn({
    llm,
    services,
    dialogs,
    turns: new TurnLog(over.capacity ?? 50),
    newId: () => uuid(5000 + ++counter),
    now: () => over.now ?? Date.parse('2026-10-10T12:00:00.000Z'),
    logger: silent,
    assistance: over.assistance,
    assistanceStates: over.assistanceStates,
  });
  return { handler, dialogs, services };
};

const collect = async (gen: AsyncIterable<UnsequencedServerEvent>) => {
  const out: UnsequencedServerEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
};
const types = (events: UnsequencedServerEvent[]) => events.map((e) => e.type);

describe('HandleTurn', () => {
  it('answers a greeting with typing indicators around the menu', async () => {
    const { handler } = make();
    const events = await collect(handler.run(text('oi')));
    expect(types(events)).toEqual([
      'status.typing',
      'status.typing',
      'message.text',
      'message.quick_replies',
    ]);
    expect(events[0]?.type === 'status.typing' && events[0].payload.state).toBe('start');
    expect(events[1]?.type === 'status.typing' && events[1].payload.state).toBe('stop');
  });

  it('puts the request session and correlation id in every event, with unique valid ids', async () => {
    const { handler } = make();
    const events = await collect(handler.run(text('oi', 7)));
    expect(events.every((e) => e.sessionId === 's1' && e.correlationId === 'corr-7')).toBe(true);
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
    for (const e of events) expect(parseChatbotLine(JSON.stringify(e)).ok).toBe(true);
  });

  it('never emits status.delivered or a seq', async () => {
    const { handler } = make();
    const events = await collect(handler.run(text('oi')));
    expect(types(events)).not.toContain('status.delivered');
    expect(events.every((e) => !('seq' in e))).toBe(true);
  });

  it('runs a journey across turns, keeping the dialog state per session', async () => {
    const llm: LlmProvider = {
      classify: async (t) => (t === 'apolices' ? intent('policies') : intent('unknown')),
    };
    const { handler, dialogs, services } = make({ llm });

    const ask = await collect(handler.run(text('apolices', 1)));
    expect(types(ask)).toContain('message.text');
    expect(dialogs.get('s1')).toEqual({ name: 'policies.awaiting_cpf' });

    const list = await collect(handler.run(text('12345678901', 2)));
    expect(types(list)).toContain('message.quick_replies');
    expect(services.listPolicies).toHaveBeenCalledTimes(1);
    expect(dialogs.get('s1')).toEqual({ name: 'policies.awaiting_choice', numeros: ['AP-1001'] });

    const detail = await collect(handler.run(quickReply('policy:AP-1001', 3)));
    expect(types(detail)).toContain('message.template');
    expect(dialogs.get('s1')).toEqual(IDLE);
  });

  it('keeps dialog states of different sessions apart', async () => {
    const llm: LlmProvider = { classify: async () => intent('claim') };
    const { handler, dialogs } = make({ llm });
    await collect(handler.run(text('sinistro')));
    const other = {
      ...text('oi', 2),
      sessionId: 's2',
      event: { ...text('oi', 2).event, sessionId: 's2' },
    } as ChatbotRequest;
    await collect(handler.run(other));
    expect(dialogs.get('s1')).toEqual({ name: 'claim.awaiting_cpf' });
    expect(dialogs.get('s2')).toEqual({ name: 'claim.awaiting_cpf' });
  });

  it('forwards the correlation id and the event id as idempotency key to the services', async () => {
    const llm: LlmProvider = { classify: async () => intent('policies', { cpf: '12345678901' }) };
    const { handler, services } = make({ llm });
    await collect(handler.run(text('minhas apolices 12345678901', 9)));
    expect(services.listPolicies).toHaveBeenCalledWith('12345678901', {
      correlationId: 'corr-9',
      idempotencyKey: idempotencyKeyFor('s1', uuid(9)),
    });
  });

  it('scopes a repeated event id by session: each session executes and gets its own events', async () => {
    const services = okServices();
    const { handler } = make({
      llm: { classify: async () => intent('policies', { cpf: '12345678901' }) },
      services,
    });
    const a = await collect(handler.run(text('apolices 12345678901', 11)));
    const b = await collect(handler.run(inSession(text('apolices 12345678901', 11), 's2')));
    expect(services.listPolicies).toHaveBeenCalledTimes(2);
    const keys = services.listPolicies.mock.calls.map((c) => (c[1] as CallContext).idempotencyKey);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys).toEqual([idempotencyKeyFor('s1', uuid(11)), idempotencyKeyFor('s2', uuid(11))]);
    expect(a.every((e) => e.sessionId === 's1')).toBe(true);
    expect(b.every((e) => e.sessionId === 's2')).toBe(true);
    expect(b.length).toBe(a.length);
  });

  it('still executes a repeated event id once within the same session', async () => {
    const services = okServices();
    const { handler } = make({
      llm: { classify: async () => intent('policies', { cpf: '12345678901' }) },
      services,
    });
    await collect(handler.run(text('apolices 12345678901', 12)));
    await collect(handler.run(text('apolices 12345678901', 12)));
    expect(services.listPolicies).toHaveBeenCalledTimes(1);
  });

  it('turns a service failure into a friendly message and keeps the state', async () => {
    const services = okServices();
    services.listPolicies = vi.fn(async () => err('unavailable' as const));
    const llm: LlmProvider = { classify: async () => intent('policies', { cpf: '12345678901' }) };
    const { handler, dialogs } = make({ llm, services });
    const events = await collect(handler.run(text('apolices 12345678901')));
    const message = events.find((e) => e.type === 'message.text');
    expect(message?.type === 'message.text' && message.payload.text).toContain('Tente novamente');
    expect(events.some((e) => e.type === 'error')).toBe(false);
    expect(dialogs.get('s1')).toEqual({ name: 'policies.awaiting_cpf' });
  });

  it('executes a repeated event id only once and replays identical events', async () => {
    const { handler, services } = make({
      llm: { classify: async () => intent('policies', { cpf: '12345678901' }) },
    });
    const req = text('apolices 12345678901', 4);
    const first = await collect(handler.run(req));
    const second = await collect(handler.run(req));
    expect(services.listPolicies).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('lets a repeated event id follow a turn that is still running (same events, one execution)', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const services = okServices();
    services.listPolicies = vi.fn(async () => {
      await gate;
      return ok([aPolicySummary()]);
    });
    const { handler } = make({
      llm: { classify: async () => intent('policies', { cpf: '12345678901' }) },
      services,
    });
    const req = text('apolices 12345678901', 5);
    const a = collect(handler.run(req));
    const b = collect(handler.run(req));
    await new Promise((r) => setTimeout(r, 20));
    release();
    const [first, second] = await Promise.all([a, b]);
    expect(services.listPolicies).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(first.length).toBeGreaterThan(2);
  });

  it('keeps executing the turn when the consumer stops reading', async () => {
    const services = okServices();
    const { handler, dialogs } = make({
      llm: { classify: async () => intent('policies', { cpf: '12345678901' }) },
      services,
    });
    const gen = handler.run(text('apolices 12345678901', 6))[Symbol.asyncIterator]();
    await gen.next();
    await gen.return?.(undefined);
    await new Promise((r) => setTimeout(r, 30));
    expect(services.listPolicies).toHaveBeenCalledTimes(1);
    expect(dialogs.get('s1')).toEqual({ name: 'policies.awaiting_choice', numeros: ['AP-1001'] });
  });

  it('answers a voice message and produces nothing for a flow data exchange', async () => {
    const { handler } = make();
    const voice = await collect(
      handler.run(request({ type: 'user.voice', payload: { mediaId: 'm1', durationMs: 3000 } }, 3)),
    );
    expect(voice.find((e) => e.type === 'message.text')).toBeDefined();
    const exchange = await collect(
      handler.run(
        request(
          {
            type: 'user.flow_data_exchange',
            payload: { flowId: 'cotacao', screen: 'X', action: 'a', data: {} },
          },
          4,
        ),
      ),
    );
    expect(exchange).toEqual([]);
  });

  it('emits an internal_error event when something unexpected throws, and still finishes', async () => {
    const llm: LlmProvider = {
      classify: async () => {
        throw new Error('boom');
      },
    };
    const { handler } = make({ llm });
    const events = await collect(handler.run(text('oi')));
    const last = events.at(-1);
    expect(last?.type === 'error' && last.payload.code).toBe('internal_error');
    expect(last?.type === 'error' && last.payload.message).not.toContain('boom');
  });

  it('survives a service port that throws instead of returning a failure', async () => {
    const services = okServices();
    services.getPolicy = vi.fn(async () => {
      throw new Error('socket exploded');
    });
    const { handler } = make({ services });
    const events = await collect(handler.run(quickReply('policy:AP-1001')));
    expect(events.at(-1)?.type).toBe('error');
  });

  it('passes today to the dialog as the claim occurrence date', async () => {
    const dialogs = memoryStore();
    dialogs.set('s1', { name: 'claim.awaiting_description', apolice: 'AP-1001', tipo: 'COLISAO' });
    const llm: LlmProvider = { classify: async () => intent('unknown') };
    const services = okServices();
    const { handler } = make({ llm, services, dialogs });
    await collect(handler.run(text('bati no portão')));
    expect(services.openClaim).toHaveBeenCalledWith(
      expect.objectContaining({ dataOcorrencia: '2026-10-10', descricao: 'bati no portão' }),
      expect.anything(),
    );
  });

  it('still emits internal_error when the logger throws while reporting the failure', async () => {
    const handler = new HandleTurn({
      llm: {
        classify: async () => {
          throw new Error('boom');
        },
      },
      services: okServices(),
      dialogs: memoryStore(),
      turns: new TurnLog(5),
      newId: () => uuid(7500 + ++counter),
      now: () => 0,
      logger: {
        ...silent,
        error: () => {
          throw new Error('logger down');
        },
      },
    });
    const events = await collect(handler.run(text('oi')));
    const last = events.at(-1);
    expect(last?.type === 'error' && last.payload.code).toBe('internal_error');
  });

  it('never leaks an unhandled rejection when the error path itself throws, and still finishes', async () => {
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => void rejections.push(reason);
    process.on('unhandledRejection', onRejection);
    try {
      let ids = 0;
      const handler = new HandleTurn({
        llm: {
          classify: async () => {
            throw new Error('boom');
          },
        },
        services: okServices(),
        dialogs: memoryStore(),
        turns: new TurnLog(5),
        // The typing event gets an id; the error event's id generation throws.
        newId: () => {
          if (++ids > 1) throw new Error('no more ids');
          return uuid(7600 + ids);
        },
        now: () => 0,
        logger: {
          ...silent,
          error: () => {
            throw new Error('logger down');
          },
        },
      });
      const events = await collect(handler.run(text('oi')));
      expect(types(events)).toEqual(['status.typing']);
      await new Promise((r) => setTimeout(r, 20));
      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onRejection);
    }
  });

  it('turns an event that breaks the protocol into internal_error instead of sending it', async () => {
    const services = okServices();
    services.secondCopy = vi.fn(async () =>
      ok(aSecondCopy({ documentoUrl: 'javascript:alert(1)' })),
    );
    const lines: string[] = [];
    const logger: Logger = { ...silent, error: (o, m) => void lines.push(JSON.stringify([o, m])) };
    const handler = new HandleTurn({
      llm: { classify: async () => intent('unknown') },
      services,
      dialogs: memoryStore(),
      turns: new TurnLog(5),
      newId: () => uuid(7700 + ++counter),
      now: () => 0,
      logger,
    });
    const events = await collect(handler.run(quickReply('policy.second_copy:AP-1001')));
    expect(types(events)).not.toContain('message.template');
    const last = events.at(-1);
    expect(last?.type === 'error' && last.payload.code).toBe('internal_error');
    for (const e of events) expect(parseChatbotLine(JSON.stringify(e)).ok).toBe(true);
    expect(lines.join('\n')).not.toContain('javascript:');
  });

  describe('drain', () => {
    const slowLlm = (ms: number): LlmProvider & { cancel(): void } => {
      let timer: NodeJS.Timeout | undefined;
      let wake: () => void = () => undefined;
      return {
        classify: async () => {
          await new Promise<void>((resolve) => {
            wake = resolve;
            timer = setTimeout(resolve, ms);
          });
          return intent('greeting');
        },
        cancel: () => {
          clearTimeout(timer);
          wake();
        },
      };
    };

    it('resolves at once when nothing is running', async () => {
      const { handler } = make();
      const t = Date.now();
      await handler.drain(5000);
      expect(Date.now() - t).toBeLessThan(50);
    });

    it('resolves after a slow running turn finishes', async () => {
      const { handler } = make({ llm: slowLlm(200) });
      const events = collect(handler.run(text('oi', 21)));
      const t = Date.now();
      await handler.drain(5000);
      const waited = Date.now() - t;
      expect(waited).toBeGreaterThanOrEqual(150);
      expect(waited).toBeLessThan(1000);
      expect(types(await events)).toContain('message.quick_replies');
    });

    it('resolves after the timeout when the turn does not finish', async () => {
      const llm = slowLlm(5000);
      const { handler } = make({ llm });
      const events = collect(handler.run(text('oi', 22)));
      const t = Date.now();
      await handler.drain(100);
      const waited = Date.now() - t;
      expect(waited).toBeGreaterThanOrEqual(90);
      expect(waited).toBeLessThan(1000);
      llm.cancel();
      await events;
    });
  });

  it('uses the São Paulo date as today (late evening there is already tomorrow in UTC)', async () => {
    const dialogs = memoryStore();
    dialogs.set('s1', { name: 'claim.awaiting_description', apolice: 'AP-1001', tipo: 'COLISAO' });
    const services = okServices();
    const { handler } = make({
      llm: { classify: async () => intent('unknown') },
      services,
      dialogs,
      now: Date.parse('2026-10-11T01:30:00.000Z'),
    });
    await collect(handler.run(text('bati no portão')));
    expect(services.openClaim).toHaveBeenCalledWith(
      expect.objectContaining({ dataOcorrencia: '2026-10-10' }),
      expect.anything(),
    );
  });

  it('does not log the text the user typed', async () => {
    const lines: string[] = [];
    const logger: Logger = {
      debug: (o, m) => void lines.push(JSON.stringify([o, m])),
      info: (o, m) => void lines.push(JSON.stringify([o, m])),
      warn: (o, m) => void lines.push(JSON.stringify([o, m])),
      error: (o, m) => void lines.push(JSON.stringify([o, m])),
    };
    const llm: LlmProvider = {
      classify: async () => {
        throw new Error('boom');
      },
    };
    const handler = new HandleTurn({
      llm,
      services: okServices(),
      dialogs: memoryStore(),
      turns: new TurnLog(5),
      newId: () => uuid(7000 + ++counter),
      now: () => 0,
      logger,
    });
    await collect(handler.run(text('MEU-SEGREDO-123 e o cpf 12345678901')));
    expect(lines.join('\n')).not.toContain('MEU-SEGREDO-123');
    expect(lines.join('\n')).not.toContain('12345678901');
  });

  describe('flow data exchange', () => {
    const canary = 'CANARIO-EXCHANGE-91c2';
    const exchange = (id: number) =>
      request(
        {
          type: 'user.flow_data_exchange',
          payload: {
            flowId: 'demo',
            screen: 'DADOS',
            action: 'data_exchange',
            data: { nome: canary, cpf: '12345678901', nested: { segredo: canary } },
          },
        },
        id,
      );
    const recording = () => {
      const calls: Array<{ level: string; obj: object; msg: string }> = [];
      const at =
        (level: string) =>
        (obj: object, msg: string): void =>
          void calls.push({ level, obj, msg });
      const logger: Logger = {
        debug: at('debug'),
        info: at('info'),
        warn: at('warn'),
        error: at('error'),
      };
      return { calls, logger };
    };
    const build = (logger: Logger, dialogs: DialogStore, llm: LlmProvider) =>
      new HandleTurn({
        llm,
        services: okServices(),
        dialogs,
        turns: new TurnLog(5),
        newId: () => uuid(7800 + ++counter),
        now: () => 0,
        logger,
      });

    it('emits no event, never classifies and leaves the dialog state untouched', async () => {
      const dialogs = memoryStore();
      const state: DialogState = { name: 'policies.awaiting_cpf' };
      dialogs.set('s1', state);
      const set = vi.spyOn(dialogs, 'set');
      const classify = vi.fn(async () => intent('greeting'));
      const handler = build(recording().logger, dialogs, { classify });
      const events = await collect(handler.run(exchange(31)));
      expect(events).toEqual([]);
      expect(classify).not.toHaveBeenCalled();
      expect(set).not.toHaveBeenCalled();
      expect(dialogs.get('s1')).toEqual(state);
    });

    it('logs only the ids, screen, action and the number of data keys at debug level', async () => {
      const { calls, logger } = recording();
      const handler = build(logger, memoryStore(), { classify: async () => intent('greeting') });
      await collect(handler.run(exchange(32)));
      expect(calls).toEqual([
        {
          level: 'debug',
          obj: {
            sessionId: 's1',
            correlationId: 'corr-32',
            flowId: 'demo',
            screen: 'DADOS',
            action: 'data_exchange',
            dataKeys: 3,
          },
          msg: expect.any(String),
        },
      ]);
      const all = JSON.stringify(calls);
      expect(all).not.toContain(canary);
      expect(all).not.toContain('12345678901');
    });

    it('replays the same empty turn for a repeated event id and executes it once', async () => {
      const { calls, logger } = recording();
      const handler = build(logger, memoryStore(), { classify: async () => intent('greeting') });
      const req = exchange(33);
      const first = await collect(handler.run(req));
      const second = await Promise.race([
        collect(handler.run(req)),
        new Promise<'hung'>((r) => setTimeout(() => r('hung'), 500)),
      ]);
      expect(first).toEqual([]);
      expect(second).toEqual([]);
      expect(calls.filter((c) => c.level === 'debug')).toHaveLength(1);
    });
  });

  it.each(['oi', 'Olá!', 'bom dia'])(
    'opens the assistance welcome and product catalog from %s',
    async (greeting) => {
      const assistanceStates = new InMemoryAssistanceStateStore(10, 60_000);
      const { handler } = make({ assistance: assistancePort(), assistanceStates });
      const welcome = await collect(handler.run(text(greeting, 401)));
      const options = welcome.find((event) => event.type === 'message.quick_replies');
      expect(
        options?.type === 'message.quick_replies' &&
          options.payload.options.map((option) => option.title),
      ).toEqual(['Conhecer produtos', 'Meu contrato', 'Falar com uma pessoa']);
      const products = await collect(handler.run(quickReply('DES-01', 402)));
      expect(products).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'message.flow',
            payload: expect.objectContaining({ flowId: 'DES-01' }),
          }),
        ]),
      );
      expect(assistanceStates.get('s1')?.gateApproved).toBe(false);
    },
  );

  it('keeps the CPF gate on a personal request entered from the assistance welcome', async () => {
    const assistanceStates = new InMemoryAssistanceStateStore(10, 60_000);
    const { handler } = make({ assistance: assistancePort(), assistanceStates });
    await collect(handler.run(text('oi', 403)));
    await collect(handler.run(quickReply('IDE-01', 404)));
    expect(assistanceStates.get('s1')).toMatchObject({ screenId: 'IDE-01', gateApproved: false });
    const cpf = await collect(handler.run(quickReply('IDE-08', 405)));
    expect(cpf.some((event) => event.type === 'message.flow')).toBe(false);
    expect(assistanceStates.get('s1')?.gateApproved).toBe(false);
  });

  it('routes valid assistance CPF submit, persists the exact domain state, and discards CPF', async () => {
    const assistanceStates = new InMemoryAssistanceStateStore(10, 60_000);
    assistanceStates.set('s1', { journeyId: 'IDE', screenId: 'IDE-08', gateApproved: false });
    const { handler, dialogs } = make({ assistance: assistancePort(), assistanceStates });
    await collect(handler.run(text('12345678901', 44)));
    expect(assistanceStates.get('s1')).toEqual({
      journeyId: 'IDE',
      screenId: 'IDE-03',
      gateApproved: true,
    });
    expect(JSON.stringify(assistanceStates.get('s1'))).not.toContain('12345678901');
    expect(dialogs.get('s1')).toEqual(IDLE);
  });

  it('emits valid, distinct CPF-success buttons and routes the contract alternative', async () => {
    const assistanceStates = new InMemoryAssistanceStateStore(10, 60_000);
    assistanceStates.set('s1', { journeyId: 'IDE', screenId: 'IDE-08', gateApproved: false });
    const { handler } = make({ assistance: assistancePort(), assistanceStates });
    const success = await collect(handler.run(text('00000000000', 406)));
    expect(success.some((event) => event.type === 'error')).toBe(false);
    const options = success.find((event) => event.type === 'message.quick_replies');
    expect(
      options?.type === 'message.quick_replies' &&
        options.payload.options.map((option) => option.title),
    ).toEqual(['Continuar pedido', 'Ver contrato']);
    if (options?.type !== 'message.quick_replies') throw new Error('missing CPF-success choices');
    expect(new Set(options.payload.options.map((option) => option.id)).size).toBe(2);
    await collect(handler.run(quickReply(options.payload.options[1]!.id, 407)));
    expect(assistanceStates.get('s1')?.screenId).toBe('CON-02');
  });

  it('replays a confirmed assistance operation without creating a second request', async () => {
    const assistance = assistancePort();
    const assistanceStates = new InMemoryAssistanceStateStore(10, 60_000);
    assistanceStates.set('s1', { journeyId: 'HUM', screenId: 'HUM-05', gateApproved: true });
    const { handler } = make({ assistance, assistanceStates });
    const req = quickReply('HUM-08', 45);
    const first = await collect(handler.run(req));
    const replay = await collect(handler.run(req));
    expect(replay).toEqual(first);
    const requests = await assistance.listRequests('s1', {
      correlationId: 'corr-45',
      idempotencyKey: idempotencyKeyFor('s1', uuid(45)),
    });
    expect(requests.ok && requests.value).toHaveLength(1);
  });

  it('serializes distinct confirmed submissions in one session against the latest review state', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const assistance = assistancePort();
    assistance.addDependent = vi.fn(async () => {
      calls++;
      if (calls === 1) await gate;
      return ok({
        id: 'd1',
        name: 'João',
        cpf: '12345678901',
        birthDate: '2010-01-01',
        relationship: 'filho',
        phone: '11999999999',
        biologicalSex: 'male' as const,
      });
    });
    const assistanceStates = new InMemoryAssistanceStateStore(10, 60_000);
    assistanceStates.set('s1', {
      journeyId: 'DEP',
      screenId: 'DEP-06',
      gateApproved: true,
      temporaryData: {
        name: 'João',
        cpf: '12345678901',
        birthDate: '2010-01-01',
        relationship: 'filho',
        phone: '11999999999',
        biologicalSex: 'male',
      },
    });
    const { handler } = make({ assistance, assistanceStates });
    const submission = (id: number) =>
      request({ type: 'user.flow_submit', payload: { flowId: 'DEP-06', data: {} } }, id);
    const first = collect(handler.run(submission(46)));
    const second = collect(handler.run(submission(47)));
    await Promise.resolve();
    release?.();
    await Promise.all([first, second]);
    expect(assistance.addDependent).toHaveBeenCalledTimes(1);
    expect(assistanceStates.get('s1')?.screenId).not.toBe('DEP-06');
  });

  it('keeps internal legacy behavior when the assistance adapter is not configured', async () => {
    const assistanceStates = new InMemoryAssistanceStateStore(10, 60_000);
    assistanceStates.set('s1', { journeyId: 'CON', screenId: 'CON-07', gateApproved: true });
    const services = okServices();
    const { handler, dialogs } = make({
      llm: { classify: async () => intent('quote') },
      services,
      assistanceStates,
    });
    const events = await collect(handler.run(text('quero fazer uma cotação', 48)));
    expect(types(events)).toContain('message.flow');
    expect(dialogs.get('s1')).toEqual({ name: 'quote.awaiting_flow' });
    expect(assistanceStates.get('s1')).toBeUndefined();
    expect(services.createQuote).not.toHaveBeenCalled();
  });
});
