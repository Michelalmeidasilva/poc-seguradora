import { CircuitOpenError } from '@seguradora/resilience';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChatbotHttpError, ChatbotProtocolError } from '../application/errors';
import { clientText } from '../test/fixtures';
import { failWith, replyText, startFakeChatbot, type FakeChatbot } from '../test/fake-chatbot';
import { createChatbotPolicy, isSafeToRetry, isUpstreamFailure } from './chatbot-policy';
import { HttpChatbotClient } from './http-chatbot-client';

const policyOptions = {
  connectTimeoutMs: 500,
  retries: 2,
  retryBaseDelayMs: 1,
  retryMaxDelayMs: 2,
  breakerFailureThreshold: 3,
  breakerResetMs: 60_000,
  bulkheadMaxConcurrent: 5,
  bulkheadMaxQueue: 5,
};

const request = (n = 1) => ({
  v: 1 as const,
  sessionId: 's1',
  correlationId: `corr-${n}`,
  event: clientText(n),
});

const drain = async (stream: AsyncIterable<unknown>) => {
  const out = [];
  for await (const e of stream) out.push(e);
  return out;
};

let fake: FakeChatbot;
beforeEach(async () => {
  fake = await startFakeChatbot(replyText('olá'));
});
afterEach(async () => {
  await fake.close();
});

const makeClient = (o: Partial<typeof policyOptions> & { turnTimeoutMs?: number } = {}) => {
  const { turnTimeoutMs, ...policyOverrides } = o;
  return new HttpChatbotClient({
    baseUrl: fake.url,
    policy: createChatbotPolicy({ ...policyOptions, ...policyOverrides }),
    turnTimeoutMs: turnTimeoutMs ?? 5000,
  });
};

describe('HttpChatbotClient', () => {
  it('answers 400 when the gateway sends a request that breaks the schema (other than correlationId)', async () => {
    const res = await fetch(fake.url + '/v1/chat/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        v: 2,
        sessionId: 's1',
        correlationId: 'c',
        event: { type: 'user.text' },
      }),
    });
    expect(res.status).toBe(400);
    expect(fake.requests).toHaveLength(0);
  });

  it('posts the request as JSON and streams the reply events', async () => {
    const client = makeClient();
    const events = await drain(await client.send(request()));
    expect(events).toHaveLength(1);
    expect(fake.requests[0]?.sessionId).toBe('s1');
    expect(fake.requests[0]?.event.type).toBe('user.text');
  });

  it('sends the correlation id and JSON content type headers', async () => {
    await drain(await makeClient().send(request(7)));
    expect(fake.headers[0]?.['x-correlation-id']).toBe('corr-7');
    expect(fake.headers[0]?.['content-type']).toBe('application/json');
    expect(fake.headers[0]?.accept).toBe('application/x-ndjson');
  });

  it('rejects with ChatbotHttpError for a 4xx and does not retry it', async () => {
    fake.setBehavior(failWith(400));
    await expect(makeClient().send(request())).rejects.toMatchObject({
      name: 'ChatbotHttpError',
      status: 400,
    });
    expect(fake.hits).toBe(1);
  });

  it('retries 503 and succeeds when the chatbot recovers', async () => {
    let calls = 0;
    fake.setBehavior((req, res) => {
      calls++;
      if (calls < 3) return failWith(503)(req, res);
      return replyText('recuperado')(req, res);
    });
    const events = await drain(await makeClient().send(request()));
    expect(events).toHaveLength(1);
    expect(fake.hits).toBe(3);
  });

  it('gives up after the retries and rejects with the last error', async () => {
    fake.setBehavior(failWith(503));
    await expect(makeClient().send(request())).rejects.toBeInstanceOf(ChatbotHttpError);
    expect(fake.hits).toBe(3);
  });

  it('opens the circuit after repeated failures and stops calling the chatbot', async () => {
    fake.setBehavior(failWith(500));
    const client = makeClient({ retries: 0, breakerFailureThreshold: 2 });
    await expect(client.send(request())).rejects.toBeInstanceOf(ChatbotHttpError);
    await expect(client.send(request())).rejects.toBeInstanceOf(ChatbotHttpError);
    const hitsBefore = fake.hits;
    await expect(client.send(request())).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fake.hits).toBe(hitsBefore);
  });

  it('rejects when the chatbot is not reachable', async () => {
    const address = fake.url;
    await fake.close();
    const client = new HttpChatbotClient({
      baseUrl: address,
      policy: createChatbotPolicy({ ...policyOptions, retries: 0 }),
      turnTimeoutMs: 1000,
    });
    await expect(client.send(request())).rejects.toBeInstanceOf(TypeError);
    fake = await startFakeChatbot();
  });

  it('fails the stream with ChatbotProtocolError when the chatbot sends an invalid line', async () => {
    fake.setBehavior((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      res.end('this is not json\n');
    });
    const stream = await makeClient().send(request());
    await expect(drain(stream)).rejects.toBeInstanceOf(ChatbotProtocolError);
  });

  it('omits an unsafe correlation id header but keeps it in the body', async () => {
    const unsafe = { ...request(), correlationId: 'bad\nid é中' };
    const events = await drain(await makeClient().send(unsafe));
    expect(events).toHaveLength(1);
    expect(fake.hits).toBe(1);
    expect(fake.requests[0]?.correlationId).toBe('bad\nid é中');
    expect(fake.headers[0]?.['x-correlation-id']).toBeUndefined();
  });

  it('does not open the circuit because of an unsafe correlation id', async () => {
    const unsafe = { ...request(), correlationId: 'bad\nid é中' };
    const client = makeClient({ retries: 0, breakerFailureThreshold: 1 });
    await drain(await client.send(unsafe));
    await drain(await client.send(unsafe));
    expect(fake.hits).toBe(2);
  });

  it('aborts a stream that outlives the turn timeout', async () => {
    fake.setBehavior((req, res) => {
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      res.write(
        JSON.stringify({
          v: 1,
          id: '00000000-0000-4000-8000-000000000001',
          sessionId: req.sessionId,
          correlationId: req.correlationId,
          ts: new Date().toISOString(),
          type: 'status.typing',
          payload: { state: 'start' },
        }) + '\n',
      );
    });
    const stream = await makeClient({ turnTimeoutMs: 150 }).send(request());
    await expect(drain(stream)).rejects.toBeDefined();
  });
});

describe('retry and failure predicates', () => {
  it('retries timeouts, network errors and 502/503/504 only', () => {
    expect(isSafeToRetry(new TypeError('fetch failed'))).toBe(true);
    expect(isSafeToRetry(new ChatbotHttpError(503))).toBe(true);
    expect(isSafeToRetry(new ChatbotHttpError(502))).toBe(true);
    expect(isSafeToRetry(new ChatbotHttpError(504))).toBe(true);
    expect(isSafeToRetry(new ChatbotHttpError(500))).toBe(false);
    expect(isSafeToRetry(new ChatbotHttpError(400))).toBe(false);
    expect(isSafeToRetry(new CircuitOpenError())).toBe(false);
  });

  it('ignores TypeErrors that are not network failures', () => {
    const header = new TypeError('invalid header value');
    expect(isSafeToRetry(header)).toBe(false);
    expect(isUpstreamFailure(header)).toBe(false);
    expect(isSafeToRetry(new TypeError('fetch failed'))).toBe(true);
    expect(isUpstreamFailure(new TypeError('fetch failed'))).toBe(true);
  });

  it('counts only upstream problems as breaker failures', () => {
    expect(isUpstreamFailure(new ChatbotHttpError(500))).toBe(true);
    expect(isUpstreamFailure(new TypeError('fetch failed'))).toBe(true);
    expect(isUpstreamFailure(new ChatbotHttpError(400))).toBe(false);
    expect(isUpstreamFailure(new ChatbotProtocolError('x'))).toBe(false);
  });
});
