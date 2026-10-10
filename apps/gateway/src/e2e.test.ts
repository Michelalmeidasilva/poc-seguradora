import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import pino from 'pino';
import { createGateway, type Gateway } from './compose';
import { clientText } from './test/fixtures';
import { failWith, replyText, startFakeChatbot, type FakeChatbot } from './test/fake-chatbot';
import { testConfig } from './test/harness';
import { openSse } from './test/sse-client';

let chatbot!: FakeChatbot;
let gateway!: Gateway;
let baseUrl: string;
const connections: Array<{ close(): void }> = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function start(env: Record<string, string> = {}) {
  const fake = await startFakeChatbot(replyText('olá do chatbot'));
  chatbot = fake;
  const gw = await createGateway(
    testConfig({
      CHATBOT_URL: fake.url,
      CHATBOT_RETRIES: '1',
      CHATBOT_RETRY_BASE_MS: '1',
      CHATBOT_RETRY_MAX_MS: '2',
      CHATBOT_CONNECT_TIMEOUT_MS: '500',
      ...env,
    }),
    { logger: pino({ level: 'silent' }) },
  );
  gateway = gw;
  await gw.app.listen({ port: 0, host: '127.0.0.1' });
  const address = gw.app.server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${address.port}`;
}

async function login() {
  const res = await fetch(`${baseUrl}/v1/session`, { method: 'POST' });
  const setCookie = res.headers.getSetCookie().find((c) => c.startsWith('sid='));
  const cookie = setCookie?.split(';')[0] ?? '';
  const { sessionId } = (await res.json()) as { sessionId: string };
  return { sessionId, cookie };
}

const send = (cookie: string, body: unknown) =>
  fetch(`${baseUrl}/v1/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });

const stream = async (cookie: string, lastEventId?: string) => {
  const conn = await openSse(`${baseUrl}/v1/stream`, {
    cookie,
    ...(lastEventId ? { lastEventId } : {}),
  });
  connections.push(conn);
  return conn;
};

afterEach(async () => {
  for (const c of connections.splice(0)) c.close();
  await gateway?.app.close();
  await chatbot?.close();
});

describe('gateway end to end', () => {
  beforeEach(async () => {
    await start();
  });

  it('delivers a chatbot reply in order with consecutive seq', async () => {
    const { sessionId, cookie } = await login();
    const conn = await stream(cookie);
    expect((await send(cookie, clientText(1, sessionId, 'quero uma cotação'))).status).toBe(202);

    const messages = await conn.waitFor(2);
    const events = messages.map((m) => JSON.parse(m.data ?? '{}'));
    expect(events.map((e) => e.seq)).toEqual([1, 2]);
    expect(events.map((e) => e.type)).toEqual(['status.delivered', 'message.text']);
    expect(events[0].payload.messageId).toBe(clientText(1, sessionId).id);
    expect(events[1].payload.text).toBe('olá do chatbot');
    expect(chatbot.requests[0]?.event.type).toBe('user.text');
    expect(chatbot.requests[0]?.sessionId).toBe(sessionId);
  });

  it('resumes after a reconnect without duplicating or losing events', async () => {
    const { sessionId, cookie } = await login();
    const first = await stream(cookie);
    await send(cookie, clientText(1, sessionId));
    await first.waitFor(2);
    first.close();
    await first.closed;

    await send(cookie, clientText(2, sessionId));
    await sleep(100);
    const second = await stream(cookie, '2');
    const messages = await second.waitFor(2);
    expect(messages.map((m) => m.id)).toEqual(['3', '4']);
  });

  it('does not forward a duplicate POST to the chatbot', async () => {
    const { sessionId, cookie } = await login();
    const event = clientText(1, sessionId);
    expect((await send(cookie, event)).status).toBe(202);
    const again = await send(cookie, event);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ status: 'duplicate' });
    const deadline = Date.now() + 2000;
    while (chatbot.requests.length < 1 && Date.now() < deadline) await sleep(10);
    await sleep(100);
    expect(chatbot.requests).toHaveLength(1);
  });

  it('keeps sessions isolated from each other', async () => {
    const a = await login();
    const b = await login();
    const connA = await stream(a.cookie);
    const connB = await stream(b.cookie);
    await send(a.cookie, clientText(1, a.sessionId));
    await connA.waitFor(2);
    await sleep(100);
    expect(connB.messages).toHaveLength(0);
  });

  it('reports upstream_unavailable with the message id and accepts a resend after recovery', async () => {
    const { sessionId, cookie } = await login();
    const conn = await stream(cookie);
    const event = clientText(1, sessionId);

    chatbot.setBehavior(failWith(503));
    expect((await send(cookie, event)).status).toBe(202);
    const failure = JSON.parse((await conn.waitFor(1))[0]?.data ?? '{}');
    expect(failure.type).toBe('error');
    expect(failure.payload.code).toBe('upstream_unavailable');
    expect(failure.payload.messageId).toBe(event.id);

    chatbot.setBehavior(replyText('voltei'));
    const resend = await send(cookie, event);
    expect(resend.status).toBe(202);
    const messages = await conn.waitFor(3);
    expect(messages.slice(1).map((m) => m.event)).toEqual(['status.delivered', 'message.text']);
    const resent = messages.slice(1).map((m) => JSON.parse(m.data ?? '{}'));
    expect(resent.map((e) => e.seq)).toEqual([2, 3]);
    expect(resent[0].payload.messageId).toBe(event.id);
  });

  it('turns an invalid chatbot line into internal_error without crashing the gateway', async () => {
    const { sessionId, cookie } = await login();
    const conn = await stream(cookie);
    chatbot.setBehavior((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      res.end('garbage\n');
    });
    await send(cookie, clientText(1, sessionId));
    const messages = await conn.waitFor(2);
    const last = JSON.parse(messages[1]?.data ?? '{}');
    expect(last.payload.code).toBe('internal_error');
    expect((await fetch(`${baseUrl}/health`)).status).toBe(200);
  });
});

describe('gateway resilience', () => {
  it('stops calling the chatbot once the circuit is open and still answers the client', async () => {
    await start({
      CHATBOT_RETRIES: '0',
      BREAKER_FAILURE_THRESHOLD: '2',
      BREAKER_RESET_MS: '60000',
    });
    const { sessionId, cookie } = await login();
    const conn = await stream(cookie);
    chatbot.setBehavior(failWith(500));

    await send(cookie, clientText(1, sessionId));
    await send(cookie, clientText(2, sessionId));
    await conn.waitFor(2);
    const hitsAtOpen = chatbot.hits;
    expect(hitsAtOpen).toBe(2);

    await send(cookie, clientText(3, sessionId));
    const messages = await conn.waitFor(3);
    expect(JSON.parse(messages[2]?.data ?? '{}').payload.code).toBe('upstream_unavailable');
    expect(chatbot.hits).toBe(hitsAtOpen);
  });

  it('closes live streams on shutdown', async () => {
    await start();
    const { cookie } = await login();
    const conn = await stream(cookie);
    await sleep(30);
    await gateway.app.close();
    await conn.closed;
    await chatbot.close();
    await start();
  });
});
