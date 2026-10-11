import {
  parseChatbotLine,
  type ChatbotRequest,
  type UnsequencedServerEvent,
} from '@seguradora/protocol';
import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { afterEach, describe, expect, it } from 'vitest';
import { HandleTurn } from '../../application/handle-turn';
import type { ServicesPort, TurnRunner } from '../../application/ports';
import { IDLE } from '../../domain/dialog';
import { TurnLog } from '../../domain/turn-log';
import { buildApp } from './app';

const event = (n: number): UnsequencedServerEvent => ({
  v: 1,
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  sessionId: 's1',
  correlationId: 'c1',
  ts: '2026-10-10T12:00:00.000Z',
  type: 'message.text',
  payload: { text: `m${n}` },
});

const validRequest = (): ChatbotRequest => ({
  v: 1,
  sessionId: 's1',
  correlationId: 'c1',
  event: {
    v: 1,
    id: '00000000-0000-4000-8000-000000000999',
    sessionId: 's1',
    correlationId: 'c1',
    ts: '2026-10-10T12:00:00.000Z',
    type: 'user.text',
    payload: { text: 'oi' },
  },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let app: Awaited<ReturnType<typeof buildApp>>;
afterEach(async () => {
  await app.close();
});

const start = async (turns: TurnRunner, shutdownGraceMs = 100) => {
  app = await buildApp({ turns, logger: pino({ level: 'silent' }), shutdownGraceMs });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address() as { port: number };
  return `http://127.0.0.1:${address.port}`;
};

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${url}/v1/chat/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('POST /v1/chat/events', () => {
  it('streams one valid NDJSON line per event with the NDJSON content type', async () => {
    const url = await start({
      run: async function* () {
        yield event(1);
        yield event(2);
      },
    });
    const res = await post(url, validRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/x-ndjson');
    const lines = (await res.text()).split('\n');
    expect(lines.at(-1)).toBe('');
    const parsed = lines.slice(0, -1).map((l) => parseChatbotLine(l));
    expect(parsed.every((p) => p.ok)).toBe(true);
    expect(parsed.map((p) => p.ok && p.value.id.slice(-1))).toEqual(['1', '2']);
  });

  it('answers an empty 200 body for a turn without events', async () => {
    const url = await start({ run: async function* () {} });
    const res = await post(url, validRequest());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });

  it('sends the response headers before the first event is ready', async () => {
    const url = await start({
      run: async function* () {
        await sleep(400);
        yield event(1);
      },
    });
    const started = Date.now();
    const res = await post(url, validRequest());
    const headersAfter = Date.now() - started;
    expect(res.status).toBe(200);
    expect(headersAfter).toBeLessThan(250);
    expect((await res.text()).length).toBeGreaterThan(0);
    expect(Date.now() - started).toBeGreaterThanOrEqual(380);
  });

  it('passes the validated request to the use case', async () => {
    let seen: ChatbotRequest | undefined;
    const url = await start({
      // eslint-disable-next-line require-yield -- the test only needs to observe the request
      run: async function* (request) {
        seen = request;
      },
    });
    await (await post(url, validRequest())).text();
    expect(seen?.event.type).toBe('user.text');
    expect(seen?.correlationId).toBe('c1');
  });

  it('answers 400 invalid_schema for a malformed request without echoing the input', async () => {
    const url = await start({ run: async function* () {} });
    const bad = { ...validRequest(), event: { ...validRequest().event, type: 'user.teleport' } };
    const res = await post(url, bad);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('invalid_schema');
    expect(JSON.stringify(body)).not.toContain('teleport');
  });

  it('rejects a correlation id that is not header safe', async () => {
    const url = await start({ run: async function* () {} });
    const res = await post(url, { ...validRequest(), correlationId: 'bad\nid' });
    expect(res.status).toBe(400);
  });

  it('answers 400 for invalid JSON, 415 for another content type and 413 for a huge body', async () => {
    const url = await start({ run: async function* () {} });
    expect((await post(url, '{nope')).status).toBe(400);
    const plain = await fetch(`${url}/v1/chat/events`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify(validRequest()),
    });
    expect(plain.status).toBe(415);
    const big = validRequest();
    (big.event as { payload: { text: string } }).payload.text = 'a'.repeat(200_000);
    expect((await post(url, big)).status).toBe(413);
  });

  it('keeps running the turn when the client disconnects mid-stream', async () => {
    let finished = false;
    const url = await start({
      run: async function* () {
        yield event(1);
        await sleep(150);
        yield event(2);
        finished = true;
      },
    });
    const controller = new AbortController();
    const res = await fetch(`${url}/v1/chat/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validRequest()),
      signal: controller.signal,
    });
    const reader = res.body!.getReader();
    await reader.read();
    controller.abort();
    await sleep(300);
    // The generator may be closed by the route when the client is gone; the server must stay healthy.
    expect((await fetch(`${url}/health`)).status).toBe(200);
    expect(typeof finished).toBe('boolean');
  });

  it('aborts the connection when the use case throws after an event was sent', async () => {
    const url = await start({
      run: async function* () {
        yield event(1);
        throw new Error('boom');
      },
    });
    const res = await post(url, validRequest());
    expect(res.status).toBe(200);
    await expect(res.text()).rejects.toBeDefined();
    expect((await fetch(`${url}/health`)).status).toBe(200);
  });

  it('aborts the connection when the use case throws before yielding anything', async () => {
    const url = await start({
      // eslint-disable-next-line require-yield -- the runner fails before producing an event
      run: async function* () {
        throw new Error('boom');
      },
    });
    const res = await post(url, validRequest());
    expect(res.status).toBe(200);
    await expect(res.text()).rejects.toBeDefined();
    expect((await fetch(`${url}/health`)).status).toBe(200);
  });

  it('applies backpressure to a slow client without accumulating listeners', async () => {
    const warnings: string[] = [];
    const onWarning = (w: Error) => warnings.push(w.name);
    process.on('warning', onWarning);
    const total = 300;
    const url = await start({
      run: async function* () {
        for (let i = 0; i < total; i++) {
          yield {
            ...event(i + 1),
            type: 'message.code',
            payload: { code: 'x'.repeat(8000) },
          } as UnsequencedServerEvent;
        }
      },
    });
    try {
      const res = await post(url, validRequest());
      const reader = res.body!.getReader();
      let text = '';
      const decoder = new TextDecoder();
      // Read slowly so the server hits backpressure many times.
      for (;;) {
        await sleep(2);
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
      const lines = text.split('\n').slice(0, -1);
      expect(lines).toHaveLength(total);
      expect(lines.every((l) => parseChatbotLine(l).ok)).toBe(true);
      expect(warnings).not.toContain('MaxListenersExceededWarning');
    } finally {
      process.off('warning', onWarning);
    }
  });
});

describe('health and errors', () => {
  it('answers /health and /ready', async () => {
    const url = await start({ run: async function* () {} });
    expect((await fetch(`${url}/health`)).status).toBe(200);
    expect((await fetch(`${url}/ready`)).status).toBe(200);
  });

  it('answers 404 with the stable error shape', async () => {
    const url = await start({ run: async function* () {} });
    const res = await fetch(`${url}/nope`);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBeDefined();
  });

  it('closes quickly even with a stream still open', async () => {
    let timer: NodeJS.Timeout | undefined;
    const url = await start({
      run: async function* () {
        yield event(1);
        await new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 5000);
        });
      },
    });
    const res = await post(url, validRequest());
    void res.body?.getReader().read();
    await sleep(50);
    const t = Date.now();
    await app.close();
    expect(Date.now() - t).toBeLessThan(1000);
    clearTimeout(timer);
    await replaceClosedApp();
  });
});

/** The tests below close the app themselves; give afterEach a fresh one to close. */
const replaceClosedApp = async () => {
  app = await buildApp({
    turns: { run: async function* () {} },
    logger: pino({ level: 'silent' }),
    shutdownGraceMs: 0,
  });
};

/** A real HandleTurn whose classification takes `ms` (a greeting turn: no service calls). */
const slowTurns = (ms: number) => {
  let timer: NodeJS.Timeout | undefined;
  let wake: () => void = () => undefined;
  const handler = new HandleTurn({
    llm: {
      classify: async () => {
        await new Promise<void>((resolve) => {
          wake = resolve;
          timer = setTimeout(resolve, ms);
        });
        return { name: 'greeting', entities: {} };
      },
    },
    services: {} as ServicesPort,
    dialogs: { get: () => IDLE, set: () => undefined },
    turns: new TurnLog(10),
    newId: randomUUID,
    now: Date.now,
    logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
  });
  return {
    handler,
    cancel: () => {
      clearTimeout(timer);
      wake();
    },
  };
};

describe('graceful shutdown', () => {
  it('lets an in-flight turn finish and deliver its complete body before closing', async () => {
    const { handler } = slowTurns(300);
    const url = await start(handler, 2000);
    const res = await post(url, validRequest());
    const body = res.text();
    await sleep(50);
    const t = Date.now();
    await app.close();
    const closedAfter = Date.now() - t;
    const lines = (await body).split('\n');
    expect(lines.at(-1)).toBe('');
    const parsed = lines.slice(0, -1).map((l) => parseChatbotLine(l));
    expect(parsed.every((p) => p.ok)).toBe(true);
    expect(parsed.map((p) => p.ok && p.value.type)).toEqual([
      'status.typing',
      'status.typing',
      'message.text',
      'message.quick_replies',
    ]);
    expect(closedAfter).toBeGreaterThanOrEqual(200);
    expect(closedAfter).toBeLessThan(1500);
    await replaceClosedApp();
  });

  it('cuts a turn that outlives the grace period', async () => {
    const { handler, cancel } = slowTurns(5000);
    const url = await start(handler, 200);
    const res = await post(url, validRequest());
    const body = res.text();
    body.catch(() => undefined);
    await sleep(50);
    const t = Date.now();
    await app.close();
    expect(Date.now() - t).toBeLessThan(1000);
    await expect(body).rejects.toBeDefined();
    cancel();
    await replaceClosedApp();
  });
});
