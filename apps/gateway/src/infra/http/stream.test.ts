import { afterEach, describe, expect, it, vi } from 'vitest';
import { JoseTokenService } from '../jose-token-service';
import { clientText, unsequencedText } from '../../test/fixtures';
import { makeHarness } from '../../test/harness';
import { openSse } from '../../test/sse-client';

type Harness = Awaited<ReturnType<typeof makeHarness>>;
let h: Harness;
const opened: Array<{ close(): void }> = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const c of opened.splice(0)) c.close();
  await h.app.close();
});

const open = async (url: string, o: Parameters<typeof openSse>[1]) => {
  const conn = await openSse(url, o);
  opened.push(conn);
  return conn;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const postEvent = (baseUrl: string, cookie: string, body: unknown) =>
  fetch(`${baseUrl}/v1/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });

describe('GET /v1/stream', () => {
  it('answers 401 without a valid session', async () => {
    h = await makeHarness();
    const url = await h.listen();
    const none = await open(`${url}/v1/stream`, {});
    expect(none.status).toBe(401);
    const bad = await open(`${url}/v1/stream`, { cookie: 'sid=garbage' });
    expect(bad.status).toBe(401);
  });

  it('answers 401 when the token is valid but the gateway lost the session', async () => {
    h = await makeHarness();
    const url = await h.listen();
    const { sessionId, cookie } = await h.login();
    // Simulate an instance restart: the gateway forgets the session while the cookie stays valid.
    h.registry.remove(sessionId);
    const conn = await open(`${url}/v1/stream`, { cookie });
    expect(conn.status).toBe(401);
  });

  it('opens an event stream with the right headers and a retry hint', async () => {
    h = await makeHarness();
    const url = await h.listen();
    const { cookie } = await h.login();
    const conn = await open(`${url}/v1/stream`, { cookie, origin: 'http://localhost:5173' });
    expect(conn.status).toBe(200);
    expect(conn.headers.get('content-type')).toContain('text/event-stream');
    expect(conn.headers.get('cache-control')).toContain('no-cache');
    expect(conn.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(conn.headers.get('access-control-allow-credentials')).toBe('true');
    await sleep(30);
    expect(conn.raw()).toContain('retry: 3000');
  });

  it('rejects a foreign Origin', async () => {
    h = await makeHarness();
    const url = await h.listen();
    const { cookie } = await h.login();
    const conn = await open(`${url}/v1/stream`, { cookie, origin: 'http://evil.example' });
    expect(conn.status).toBe(403);
  });

  it('streams events published after the connection with id equal to seq', async () => {
    h = await makeHarness();
    const url = await h.listen();
    const { sessionId, cookie } = await h.login();
    const conn = await open(`${url}/v1/stream`, { cookie });
    const session = h.registry.get(sessionId);
    session?.publish(unsequencedText(1, sessionId));
    session?.publish(unsequencedText(2, sessionId));
    const messages = await conn.waitFor(2);
    expect(messages.map((m) => m.id)).toEqual(['1', '2']);
    expect(messages.every((m) => m.event === 'message.text')).toBe(true);
    expect(JSON.parse(messages[0]?.data ?? '{}').payload.text).toBe('m1');
  });

  it('delivers the full round trip: POST an event, receive delivered and the reply', async () => {
    h = await makeHarness();
    const url = await h.listen();
    const { sessionId, cookie } = await h.login();
    const conn = await open(`${url}/v1/stream`, { cookie });
    const res = await postEvent(url, cookie, clientText(1, sessionId, 'oi'));
    expect(res.status).toBe(202);
    const messages = await conn.waitFor(2);
    expect(messages.map((m) => m.event)).toEqual(['status.delivered', 'message.text']);
    expect(JSON.parse(messages[1]?.data ?? '{}').payload.text).toBe('echo: oi');
  });

  it('replays what the client missed using Last-Event-ID', async () => {
    h = await makeHarness();
    const url = await h.listen();
    const { sessionId, cookie } = await h.login();
    const session = h.registry.get(sessionId);
    [1, 2, 3].forEach((n) => session?.publish(unsequencedText(n, sessionId)));
    const conn = await open(`${url}/v1/stream`, { cookie, lastEventId: '1' });
    const messages = await conn.waitFor(2);
    expect(messages.map((m) => m.id)).toEqual(['2', '3']);
  });

  it('replays everything for a client that never received an event', async () => {
    h = await makeHarness();
    const url = await h.listen();
    const { sessionId, cookie } = await h.login();
    const session = h.registry.get(sessionId);
    [1, 2].forEach((n) => session?.publish(unsequencedText(n, sessionId)));
    const conn = await open(`${url}/v1/stream`, { cookie });
    expect((await conn.waitFor(2)).map((m) => m.id)).toEqual(['1', '2']);
  });

  it('sends heartbeats', async () => {
    h = await makeHarness();
    const url = await h.listen();
    const { cookie } = await h.login();
    const conn = await open(`${url}/v1/stream`, { cookie });
    await sleep(160);
    expect(conn.raw()).toContain(': hb');
  });

  it('replaces the previous stream of the same session when a new one opens', async () => {
    h = await makeHarness();
    const url = await h.listen();
    const { sessionId, cookie } = await h.login();
    const first = await open(`${url}/v1/stream`, { cookie });
    await sleep(20);
    const second = await open(`${url}/v1/stream`, { cookie });
    await first.closed;
    h.registry.get(sessionId)?.publish(unsequencedText(1, sessionId));
    expect((await second.waitFor(1))[0]?.id).toBe('1');
    expect(h.registry.get(sessionId)?.listenerCount).toBe(1);
  });

  it('cleans up the listener and keeps buffering when the client disconnects', async () => {
    h = await makeHarness();
    const url = await h.listen();
    const { sessionId, cookie } = await h.login();
    const session = h.registry.get(sessionId);
    const conn = await open(`${url}/v1/stream`, { cookie });
    await sleep(30);
    expect(session?.listenerCount).toBe(1);
    conn.close();
    await conn.closed;
    for (let i = 0; i < 20 && session?.listenerCount !== 0; i++) await sleep(25);
    expect(session?.listenerCount).toBe(0);

    session?.publish(unsequencedText(1, sessionId));
    const again = await open(`${url}/v1/stream`, { cookie });
    expect((await again.waitFor(1))[0]?.id).toBe('1');
  });

  it('ends open streams when the app closes', async () => {
    h = await makeHarness();
    const url = await h.listen();
    const { cookie } = await h.login();
    const conn = await open(`${url}/v1/stream`, { cookie });
    await sleep(30);
    await h.app.close();
    await conn.closed;
    h = await makeHarness();
  });

  it('does not leak a listener or heartbeat when the client aborts while the token is being verified', async () => {
    h = await makeHarness();
    const url = await h.listen();
    const { sessionId, cookie } = await h.login();
    const original = JoseTokenService.prototype.verify;
    vi.spyOn(JoseTokenService.prototype, 'verify').mockImplementation(async function (
      this: JoseTokenService,
      token: string,
    ) {
      await sleep(120);
      return original.call(this, token);
    });
    const touch = vi.spyOn(h.registry, 'touch');
    const controller = new AbortController();
    const pending = fetch(`${url}/v1/stream`, { headers: { cookie }, signal: controller.signal })
      .then(() => undefined)
      .catch((error: Error) => expect(error.name).toBe('AbortError'));
    await sleep(30);
    controller.abort();
    await pending;
    await sleep(300);
    expect(h.registry.get(sessionId)?.listenerCount).toBe(0);
    touch.mockClear();
    await sleep(200);
    expect(touch).not.toHaveBeenCalled();
  });
});
