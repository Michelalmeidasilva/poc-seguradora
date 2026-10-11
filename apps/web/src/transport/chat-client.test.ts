import type { ClientEvent, ServerEvent } from '@seguradora/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi } from '../test/fake-api';
import { botText, uuid } from '../test/fixtures';
import { ChatClient, type ChatClientOptions } from './chat-client';

const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};

function setup(over: Partial<ChatClientOptions> = {}) {
  const api = createFakeApi();
  const received: ServerEvent[] = [];
  const connection: string[] = [];
  const outgoing: Array<[string, string]> = [];
  const sessions: Array<[string, string]> = [];
  let resets = 0;
  let n = 0;
  const client = new ChatClient({
    fetchImpl: api.fetchImpl,
    newId: () => uuid(100 + ++n),
    now: () => Date.parse('2026-10-10T12:00:00.000Z'),
    onServerEvent: (e) => received.push(e),
    onConnection: (c) => connection.push(c),
    onOutgoing: (id, status) => outgoing.push([id, status]),
    onSession: (id, kind) => sessions.push([id, kind]),
    onSessionReset: () => resets++,
    ackDelayMs: 300,
    retryBaseMs: 500,
    ...over,
  });
  return { api, client, received, connection, outgoing, sessions, resets: () => resets };
}

const postedEvent = (api: ReturnType<typeof createFakeApi>, index = 0) =>
  api.eventPosts()[index]?.body as ClientEvent;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('ChatClient: session and stream', () => {
  it('creates a session, then opens the stream with credentials', async () => {
    const { api, client, sessions, connection } = setup();
    await client.start();
    await flush();
    expect(api.requests[0]).toMatchObject({ method: 'POST', path: '/v1/session' });
    expect(client.sessionId).toBe('session-1');
    expect(sessions).toEqual([['session-1', 'new']]);
    expect(api.requests.some((r) => r.path === '/v1/stream')).toBe(true);
    api.pushEvent(botText(1));
    await flush();
    expect(connection).toContain('online');
    client.stop();
  });

  it('delivers valid server events and drops invalid ones', async () => {
    const { api, client, received } = setup();
    await client.start();
    await flush();
    api.pushEvent(botText(1, 'oi'));
    api.pushRaw('id: 2\ndata: {"not":"an event"}\n\n');
    api.pushRaw('id: 3\ndata: not json\n\n');
    await flush();
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ type: 'message.text' });
    client.stop();
  });

  it('advances the cursor even when the consumer throws', async () => {
    const { api, client } = setup({
      onServerEvent: () => {
        throw new Error('boom');
      },
    });
    await client.start();
    await flush();
    api.pushEvent(botText(4));
    await flush();
    await vi.advanceTimersByTimeAsync(300);
    await flush();
    expect(postedEvent(api)).toMatchObject({ type: 'user.ack', payload: { lastSeq: 4 } });
    client.stop();
  });

  it('resumes a saved session without creating a new one', async () => {
    const { api, client, sessions } = setup();
    await client.start({ sessionId: 'saved', lastSeq: 9 });
    await flush();
    expect(api.requests.some((r) => r.path === '/v1/session')).toBe(false);
    expect(sessions).toEqual([['saved', 'resumed']]);
    expect(api.requests.find((r) => r.path === '/v1/stream')?.headers['last-event-id']).toBe('9');
    client.stop();
  });

  it('creates a new session and reports a reset when the stream answers 401', async () => {
    const { api, client, sessions, resets } = setup();
    api.setStreamStatus((attempt) => (attempt === 1 ? 401 : 200));
    await client.start({ sessionId: 'expired', lastSeq: 5 });
    await flush();
    await vi.advanceTimersByTimeAsync(2000);
    await flush();
    expect(api.requests.some((r) => r.method === 'POST' && r.path === '/v1/session')).toBe(true);
    expect(resets()).toBe(1);
    expect(sessions.at(-1)).toEqual(['session-1', 'new']);
    expect(
      api.requests.filter((r) => r.path === '/v1/stream').at(-1)?.headers['last-event-id'],
    ).toBeUndefined();
    client.stop();
  });

  it('backs off instead of hot-looping when the stream keeps answering 401', async () => {
    const { api, client } = setup();
    api.setStreamStatus(401);
    await client.start({ sessionId: 'expired', lastSeq: 5 });
    await flush();
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    const sessionPosts = api.requests.filter(
      (r) => r.method === 'POST' && r.path === '/v1/session',
    );
    expect(sessionPosts.length).toBeLessThanOrEqual(3);
    client.stop();
  });

  it('retries the session request with backoff when the gateway is unavailable', async () => {
    const { api, client, connection } = setup();
    api.setSessionStatus(503);
    const started = client.start();
    await flush();
    expect(connection).toContain('connecting');
    api.setSessionStatus(201);
    await vi.advanceTimersByTimeAsync(5000);
    await started;
    await flush();
    expect(client.sessionId).toBe('session-1');
    client.stop();
  });
});

describe('ChatClient: sending', () => {
  it('posts a text event with the envelope and reports sent', async () => {
    const { api, client, outgoing } = setup();
    await client.start();
    await flush();
    const id = client.send({ type: 'user.text', payload: { text: 'oi' } });
    await flush();
    const event = postedEvent(api);
    expect(event).toMatchObject({
      v: 1,
      id,
      sessionId: 'session-1',
      type: 'user.text',
      payload: { text: 'oi' },
    });
    expect(event.correlationId).toMatch(/^[\x21-\x7e]{1,128}$/);
    expect(Number.isNaN(Date.parse(event.ts))).toBe(false);
    expect(outgoing).toEqual([
      [id, 'sending'],
      [id, 'sent'],
    ]);
    client.stop();
  });

  it('counts a duplicate (200) answer as sent', async () => {
    const { api, client, outgoing } = setup();
    api.setEventsStatus(200);
    await client.start();
    await flush();
    const id = client.send({ type: 'user.text', payload: { text: 'oi' } });
    await flush();
    expect(outgoing.at(-1)).toEqual([id, 'sent']);
    client.stop();
  });

  it('retries a network or 5xx failure with the SAME id and then succeeds', async () => {
    const { api, client, outgoing } = setup();
    api.setEventsStatus((attempt) => (attempt < 3 ? 503 : 202));
    await client.start();
    await flush();
    const id = client.send({ type: 'user.text', payload: { text: 'oi' } });
    await flush();
    await vi.advanceTimersByTimeAsync(500);
    await flush();
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    const ids = api.eventPosts().map((r) => (r.body as ClientEvent).id);
    expect(ids).toEqual([id, id, id]);
    expect(outgoing.at(-1)).toEqual([id, 'sent']);
    client.stop();
  });

  it('marks the message failed after the maximum attempts', async () => {
    const { api, client, outgoing } = setup({ maxSendAttempts: 3 });
    api.setEventsStatus(503);
    await client.start();
    await flush();
    const id = client.send({ type: 'user.text', payload: { text: 'oi' } });
    for (const wait of [0, 500, 1000, 2000]) {
      await vi.advanceTimersByTimeAsync(wait);
      await flush();
    }
    expect(api.eventPosts()).toHaveLength(3);
    expect(outgoing.at(-1)).toEqual([id, 'failed']);
    client.stop();
  });

  it.each([400, 403, 413, 415])(
    'marks the message failed at once on a %d answer',
    async (status) => {
      const { api, client, outgoing } = setup();
      api.setEventsStatus(status);
      await client.start();
      await flush();
      const id = client.send({ type: 'user.text', payload: { text: 'oi' } });
      await flush();
      expect(api.eventPosts()).toHaveLength(1);
      expect(outgoing.at(-1)).toEqual([id, 'failed']);
      client.stop();
    },
  );

  it('waits for the Retry-After of a 429 and tries again', async () => {
    const { api, client, outgoing } = setup();
    api.setEventsStatus((attempt) => (attempt === 1 ? 429 : 202));
    await client.start();
    await flush();
    const id = client.send({ type: 'user.text', payload: { text: 'oi' } });
    await flush();
    expect(api.eventPosts()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(api.eventPosts()).toHaveLength(2);
    expect(outgoing.at(-1)).toEqual([id, 'sent']);
    client.stop();
  });

  it('resend() posts the same id again after a failure', async () => {
    const { api, client, outgoing } = setup();
    api.setEventsStatus(400);
    await client.start();
    await flush();
    const id = client.send({ type: 'user.text', payload: { text: 'oi' } });
    await flush();
    expect(outgoing.at(-1)).toEqual([id, 'failed']);
    api.setEventsStatus(202);
    client.resend(id);
    await flush();
    expect(api.eventPosts().map((r) => (r.body as ClientEvent).id)).toEqual([id, id]);
    expect(outgoing.slice(-2)).toEqual([
      [id, 'sending'],
      [id, 'sent'],
    ]);
    client.stop();
  });

  it('resend() after a server-side error (message already accepted) reuses the same id', async () => {
    const { api, client } = setup();
    await client.start();
    await flush();
    const id = client.send({ type: 'user.text', payload: { text: 'oi' } });
    await flush();
    client.resend(id);
    await flush();
    expect(api.eventPosts().map((r) => (r.body as ClientEvent).id)).toEqual([id, id]);
    client.stop();
  });

  it('ignores resend() for an unknown id', async () => {
    const { api, client } = setup();
    await client.start();
    await flush();
    client.resend(uuid(9999));
    await flush();
    expect(api.eventPosts()).toHaveLength(0);
    client.stop();
  });

  it('opens a new session when a post gets 401 and then delivers the message in it', async () => {
    const { api, client, resets, outgoing } = setup();
    api.setEventsStatus((attempt) => (attempt === 1 ? 401 : 202));
    await client.start();
    await flush();
    const id = client.send({ type: 'user.text', payload: { text: 'oi' } });
    await flush();
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(resets()).toBe(1);
    const posts = api.eventPosts().map((r) => r.body as ClientEvent);
    expect(posts.map((p) => p.id)).toEqual([id, id]);
    expect(posts.map((p) => p.sessionId)).toEqual(['session-1', 'session-2']);
    expect(outgoing.at(-1)).toEqual([id, 'sent']);
    client.stop();
  });

  it('builds the other kinds of events', async () => {
    const { api, client } = setup();
    await client.start();
    await flush();
    client.send({
      type: 'user.quick_reply',
      payload: { optionId: 'menu.quote', replyToId: uuid(5) },
    });
    client.send({ type: 'user.voice', payload: { mediaId: 'local-1', durationMs: 3000 } });
    client.send({ type: 'user.flow_submit', payload: { flowId: 'cotacao', data: { nome: 'x' } } });
    await flush();
    expect(api.eventPosts().map((r) => (r.body as ClientEvent).type)).toEqual([
      'user.quick_reply',
      'user.voice',
      'user.flow_submit',
    ]);
    client.stop();
  });
});

describe('ChatClient: ack', () => {
  it('acknowledges the last seq once, debounced', async () => {
    const { api, client } = setup();
    await client.start();
    await flush();
    api.pushEvent(botText(1));
    api.pushEvent(botText(2));
    api.pushEvent(botText(3));
    await flush();
    expect(api.eventPosts()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(300);
    await flush();
    const acks = api.eventPosts().map((r) => r.body as ClientEvent);
    expect(acks).toHaveLength(1);
    expect(acks[0]).toMatchObject({ type: 'user.ack', payload: { lastSeq: 3 } });
    client.stop();
  });

  it('does not acknowledge the same seq twice and does not retry a failed ack', async () => {
    const { api, client } = setup();
    api.setEventsStatus(503);
    await client.start();
    await flush();
    api.pushEvent(botText(1));
    await flush();
    await vi.advanceTimersByTimeAsync(300);
    await flush();
    await vi.advanceTimersByTimeAsync(10_000);
    await flush();
    expect(api.eventPosts()).toHaveLength(1);
    client.stop();
  });

  it('stop() cancels a pending ack', async () => {
    const { api, client } = setup();
    await client.start();
    await flush();
    api.pushEvent(botText(1));
    await flush();
    client.stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.eventPosts()).toHaveLength(0);
  });
});
