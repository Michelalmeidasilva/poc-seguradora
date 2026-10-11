import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SseClient, type SseClientOptions } from './sse-client';

const encoder = new TextEncoder();

/** A controllable fake `fetch` for the stream route. */
function fakeStream() {
  const calls: Array<{
    url: string;
    headers: Record<string, string>;
    signal: AbortSignal | undefined;
  }> = [];
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let nextResponse: () => Response = () => new Response(null, { status: 503 });

  const respondWithStream = () => {
    nextResponse = () => {
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          controller = c;
        },
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    };
  };

  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      headers: (init?.headers ?? {}) as Record<string, string>,
      signal: init?.signal ?? undefined,
    });
    return nextResponse();
  }) as unknown as typeof fetch;

  return {
    fetchImpl,
    calls,
    respondWithStream,
    respondWith(status: number) {
      nextResponse = () => new Response(null, { status });
    },
    push(text: string) {
      controller?.enqueue(encoder.encode(text));
    },
    end() {
      controller?.close();
    },
    fail() {
      controller?.error(new TypeError('network'));
    },
  };
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

const make = (api: ReturnType<typeof fakeStream>, over: Partial<SseClientOptions> = {}) => {
  const messages: string[] = [];
  const events: string[] = [];
  let lastId: string | undefined;
  const client = new SseClient({
    url: '/v1/stream',
    fetchImpl: api.fetchImpl,
    getLastEventId: () => lastId,
    onMessage: (m) => {
      messages.push(m.data);
      if (m.id) lastId = m.id;
    },
    onOpen: () => events.push('open'),
    onDisconnect: (r) => events.push(`disconnect:${r}`),
    onUnauthorized: () => events.push('unauthorized'),
    random: () => 1,
    ...over,
  });
  return { client, messages, events };
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('SseClient', () => {
  it('connects with credentials, no Last-Event-ID on the first attempt, and delivers messages', async () => {
    const api = fakeStream();
    api.respondWithStream();
    const { client, messages, events } = make(api);
    client.start();
    await flush();
    api.push('id: 1\ndata: hello\n\n');
    await flush();
    expect(messages).toEqual(['hello']);
    expect(events).toEqual(['open']);
    expect(api.calls[0]?.url).toBe('/v1/stream');
    expect(api.calls[0]?.headers['last-event-id']).toBeUndefined();
    expect(api.calls[0]?.headers['accept']).toBe('text/event-stream');
    client.stop();
  });

  it('reconnects after the stream ends, sending the last event id', async () => {
    const api = fakeStream();
    api.respondWithStream();
    const { client, events } = make(api, { backoff: { baseMs: 1000, maxMs: 30000 } });
    client.start();
    await flush();
    api.push('id: 4\ndata: x\n\n');
    await flush();
    api.end();
    await flush();
    expect(events).toEqual(['open', 'disconnect:ended']);
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(api.calls).toHaveLength(2);
    expect(api.calls[1]?.headers['last-event-id']).toBe('4');
    client.stop();
  });

  it('backs off exponentially on failures and resets after a successful open', async () => {
    const api = fakeStream();
    api.respondWith(503);
    const { client, events } = make(api, { backoff: { baseMs: 1000, maxMs: 30000 } });
    client.start();
    await flush();
    expect(api.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(api.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(api.calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2000);
    await flush();
    expect(api.calls).toHaveLength(3);
    api.respondWithStream();
    await vi.advanceTimersByTimeAsync(4000);
    await flush();
    expect(events.filter((e) => e === 'open')).toHaveLength(1);
    api.end();
    await flush();
    // after a successful open the next delay is back to the base value
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(api.calls).toHaveLength(5);
    client.stop();
  });

  it('caps the backoff at maxMs', async () => {
    const api = fakeStream();
    api.respondWith(503);
    const { client } = make(api, { backoff: { baseMs: 1000, maxMs: 3000 } });
    client.start();
    await flush();
    for (const wait of [1000, 2000, 3000, 3000]) {
      await vi.advanceTimersByTimeAsync(wait);
      await flush();
    }
    expect(api.calls).toHaveLength(5);
    client.stop();
  });

  it('honours the retry hint of the server as the minimum delay', async () => {
    const api = fakeStream();
    api.respondWithStream();
    const { client } = make(api, { backoff: { baseMs: 100, maxMs: 30000 } });
    client.start();
    await flush();
    api.push('retry: 3000\n\n');
    await flush();
    api.end();
    await flush();
    await vi.advanceTimersByTimeAsync(2999);
    expect(api.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(api.calls).toHaveLength(2);
    client.stop();
  });

  it('reconnects when no bytes arrive for the heartbeat timeout', async () => {
    const api = fakeStream();
    api.respondWithStream();
    const { client, events } = make(api, {
      heartbeatTimeoutMs: 45000,
      backoff: { baseMs: 1000, maxMs: 30000 },
    });
    client.start();
    await flush();
    await vi.advanceTimersByTimeAsync(44000);
    expect(events).toEqual(['open']);
    api.push(': hb\n\n');
    await flush();
    await vi.advanceTimersByTimeAsync(44000);
    expect(events).toEqual(['open']);
    await vi.advanceTimersByTimeAsync(2000);
    await flush();
    expect(events).toContain('disconnect:timeout');
    expect(api.calls[0]?.signal?.aborted).toBe(true);
    client.stop();
  });

  it('reports 401 as unauthorized and stops retrying on its own', async () => {
    const api = fakeStream();
    api.respondWith(401);
    const { client, events } = make(api);
    client.start();
    await flush();
    await vi.advanceTimersByTimeAsync(60000);
    expect(events).toEqual(['unauthorized']);
    expect(api.calls).toHaveLength(1);
  });

  it('stop() aborts the request and prevents further reconnects', async () => {
    const api = fakeStream();
    api.respondWithStream();
    const { client } = make(api);
    client.start();
    await flush();
    client.stop();
    expect(api.calls[0]?.signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(60000);
    expect(api.calls).toHaveLength(1);
  });

  it('can be started again after a stop', async () => {
    const api = fakeStream();
    api.respondWithStream();
    const { client, messages, events } = make(api);
    client.start();
    await flush();
    client.stop();
    api.respondWithStream();
    client.start();
    await flush();
    expect(api.calls).toHaveLength(2);
    api.push('id: 9\ndata: new\n\n');
    await flush();
    expect(messages).toEqual(['new']);
    expect(events).toEqual(['open', 'open']);
    client.stop();
  });

  it('aborts the body and reconnects once when the consumer throws', async () => {
    const api = fakeStream();
    api.respondWithStream();
    const { client, events } = make(api, {
      onMessage: () => {
        throw new Error('bad payload');
      },
    });
    client.start();
    await flush();
    api.push('id: 1\ndata: boom\n\n');
    await flush();
    expect(api.calls[0]?.signal?.aborted).toBe(true);
    expect(events).toEqual(['open', 'disconnect:network']);
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(api.calls).toHaveLength(2);
    client.stop();
  });

  it('treats a network error as a disconnect and retries', async () => {
    const api = fakeStream();
    api.respondWithStream();
    const { client, events } = make(api);
    client.start();
    await flush();
    api.fail();
    await flush();
    expect(events).toEqual(['open', 'disconnect:network']);
    api.respondWithStream();
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(api.calls).toHaveLength(2);
    client.stop();
  });
});
