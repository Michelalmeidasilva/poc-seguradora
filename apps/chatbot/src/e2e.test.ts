import { afterEach, describe, expect, it } from 'vitest';
import type { Intent } from './domain/dialog';
import { GuardedLlmProvider } from './infra/guarded-llm-provider';
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
  await bot.close();
});

describe('chatbot end to end (fake internal services)', () => {
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
    expect(quickIds(r.events)).toEqual(['menu.quote', 'menu.policies', 'menu.claim']);
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
    expect(quickIds(next.events)).toEqual(['menu.quote', 'menu.policies', 'menu.claim']);
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
    const r = await turn(bot.url, textReq('oi'));
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
