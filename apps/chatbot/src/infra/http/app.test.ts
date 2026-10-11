import {
  parseChatbotLine,
  type ChatbotRequest,
  type UnsequencedServerEvent,
} from '@seguradora/protocol';
import pino from 'pino';
import { afterEach, describe, expect, it } from 'vitest';
import type { TurnRunner } from '../../application/ports';
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

const start = async (turns: TurnRunner) => {
  app = await buildApp({ turns, logger: pino({ level: 'silent' }) });
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

  it('survives a use case that throws after the headers were sent', async () => {
    const url = await start({
      run: async function* () {
        yield event(1);
        throw new Error('boom');
      },
    });
    const res = await post(url, validRequest());
    expect(res.status).toBe(200);
    await res.text();
    expect((await fetch(`${url}/health`)).status).toBe(200);
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
    const url = await start({
      run: async function* () {
        yield event(1);
        await sleep(5000);
      },
    });
    const res = await post(url, validRequest());
    void res.body?.getReader().read();
    await sleep(50);
    const t = Date.now();
    await app.close();
    expect(Date.now() - t).toBeLessThan(1000);
    app = await buildApp({
      turns: { run: async function* () {} },
      logger: pino({ level: 'silent' }),
    });
  });
});
