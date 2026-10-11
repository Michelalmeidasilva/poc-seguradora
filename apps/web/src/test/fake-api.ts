import type { ServerEvent } from '@seguradora/protocol';
import { vi } from 'vitest';

export interface RecordedRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}

const encoder = new TextEncoder();

/** An in-memory gateway: POST /v1/session, POST /v1/events and GET /v1/stream. */
export function createFakeApi() {
  const requests: RecordedRequest[] = [];
  let sessionCounter = 0;
  let sessionStatus = 201;
  let eventsStatus: number | ((attempt: number) => number) = 202;
  let eventsAttempts = 0;
  let streamStatus: number | ((attempt: number) => number) = 200;
  let streamAttempts = 0;
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let currentSessionId = '';

  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    requests.push({ method, path, headers, body });

    if (path.endsWith('/v1/session')) {
      if (sessionStatus !== 201) return new Response(null, { status: sessionStatus });
      currentSessionId = `session-${++sessionCounter}`;
      return new Response(JSON.stringify({ sessionId: currentSessionId }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (path.endsWith('/v1/events')) {
      const status =
        typeof eventsStatus === 'function' ? eventsStatus(++eventsAttempts) : eventsStatus;
      return new Response(status === 202 ? '{"status":"accepted"}' : '{}', {
        status,
        headers: {
          'content-type': 'application/json',
          ...(status === 429 ? { 'retry-after': '1' } : {}),
        },
      });
    }
    if (path.endsWith('/v1/stream')) {
      const status =
        typeof streamStatus === 'function' ? streamStatus(++streamAttempts) : streamStatus;
      if (status !== 200) return new Response(null, { status });
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          controller = c;
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    }
    return new Response(null, { status: 404 });
  }) as unknown as typeof fetch;

  return {
    fetchImpl,
    requests,
    get sessionId() {
      return currentSessionId;
    },
    setSessionStatus(status: number) {
      sessionStatus = status;
    },
    setEventsStatus(status: number | ((attempt: number) => number)) {
      eventsStatus = status;
      eventsAttempts = 0;
    },
    setStreamStatus(status: number | ((attempt: number) => number)) {
      streamStatus = status;
      streamAttempts = 0;
    },
    /** Stamps the fake gateway's current session id (like the real stream), unless none exists yet. */
    pushEvent(event: ServerEvent) {
      this.pushForeignEvent(currentSessionId ? { ...event, sessionId: currentSessionId } : event);
    },
    /** Pushes the event exactly as given (e.g. carrying another session's id). */
    pushForeignEvent(event: ServerEvent) {
      controller?.enqueue(
        encoder.encode(
          `id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
        ),
      );
    },
    pushRaw(text: string) {
      controller?.enqueue(encoder.encode(text));
    },
    dropStream() {
      controller?.close();
    },
    eventPosts() {
      return requests.filter((r) => r.method === 'POST' && r.path.endsWith('/v1/events'));
    },
  };
}
