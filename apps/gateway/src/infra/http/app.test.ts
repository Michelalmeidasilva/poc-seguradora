import type { ClientEvent } from '@seguradora/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { clientAck, clientText, clientTyping } from '../../test/fixtures';
import { makeHarness } from '../../test/harness';

type Harness = Awaited<ReturnType<typeof makeHarness>>;
let h: Harness;
afterEach(async () => {
  await h.app.close();
});

const origin = 'http://localhost:5173';

const post = (cookie: string | undefined, body: unknown, headers: Record<string, string> = {}) =>
  h.app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    payload: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('health', () => {
  it('answers /health and /ready without authentication', async () => {
    h = await makeHarness();
    expect((await h.app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    expect((await h.app.inject({ method: 'GET', url: '/ready' })).statusCode).toBe(200);
  });

  it('adds security headers', async () => {
    h = await makeHarness();
    const res = await h.app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('POST /v1/session', () => {
  it('creates a session, returns its id and sets an HttpOnly cookie', async () => {
    h = await makeHarness();
    const { sessionId, response } = await h.login();
    expect(response.statusCode).toBe(201);
    expect(sessionId).toMatch(/[0-9a-f-]{36}/);
    const setCookie = String(response.headers['set-cookie']);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).not.toContain('Secure');
    expect(h.registry.size).toBe(1);
  });

  it('marks the cookie Secure and SameSite=None when configured so', async () => {
    h = await makeHarness({ env: { COOKIE_SECURE: 'true', COOKIE_SAME_SITE: 'none' } });
    const { response } = await h.login();
    const setCookie = String(response.headers['set-cookie']);
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=None');
  });

  it('rejects a foreign Origin', async () => {
    h = await makeHarness();
    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/session',
      headers: { origin: 'http://evil.example' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('unauthorized');
  });

  it('answers 429 rate_limited when the gateway is at session capacity', async () => {
    h = await makeHarness({ env: { MAX_SESSIONS: '1' } });
    await h.login();
    const res = await h.app.inject({ method: 'POST', url: '/v1/session' });
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe('rate_limited');
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('rate limits session creation per IP', async () => {
    h = await makeHarness({ env: { IP_RATE_CAPACITY: '2', IP_RATE_PER_SECOND: '0.001' } });
    expect((await h.app.inject({ method: 'POST', url: '/v1/session' })).statusCode).toBe(201);
    expect((await h.app.inject({ method: 'POST', url: '/v1/session' })).statusCode).toBe(201);
    const third = await h.app.inject({ method: 'POST', url: '/v1/session' });
    expect(third.statusCode).toBe(429);
    expect(third.json().error.retryAfterMs).toBeGreaterThan(0);
  });

  it('answers CORS preflight for the allowed origin with credentials', async () => {
    h = await makeHarness();
    const res = await h.app.inject({
      method: 'OPTIONS',
      url: '/v1/events',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(res.headers['access-control-allow-origin']).toBe(origin);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
});

describe('POST /v1/events', () => {
  it('accepts a valid event with 202 and forwards it to the chatbot', async () => {
    h = await makeHarness();
    const { sessionId, cookie } = await h.login();
    const res = await post(cookie, clientText(1, sessionId));
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ status: 'accepted' });
    await new Promise((r) => setTimeout(r, 20));
    expect(h.requests).toHaveLength(1);
    expect(
      h.registry
        .get(sessionId)
        ?.replayAfter(0)
        .events.map((e) => e.type),
    ).toEqual(['status.delivered', 'message.text']);
  });

  it('answers 200 duplicate for a repeated id without forwarding again', async () => {
    h = await makeHarness();
    const { sessionId, cookie } = await h.login();
    const event = clientText(1, sessionId);
    await post(cookie, event);
    const second = await post(cookie, event);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ status: 'duplicate' });
    await new Promise((r) => setTimeout(r, 20));
    expect(h.requests).toHaveLength(1);
  });

  it('accepts ack and typing events', async () => {
    h = await makeHarness();
    const { sessionId, cookie } = await h.login();
    expect((await post(cookie, clientTyping(1, sessionId))).statusCode).toBe(202);
    expect((await post(cookie, clientAck(1, sessionId, 0))).statusCode).toBe(202);
    expect(h.requests).toHaveLength(0);
  });

  it('answers 401 without a cookie, with a garbage cookie and with a foreign signature', async () => {
    h = await makeHarness();
    const { sessionId } = await h.login();
    const event = clientText(1, sessionId);
    for (const cookie of [undefined, 'sid=garbage', 'sid=a.b.c']) {
      const res = await post(cookie, event);
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('unauthorized');
    }
  });

  it('answers 401 when the token is valid but the session is gone', async () => {
    h = await makeHarness();
    const { sessionId, cookie } = await h.login();
    const gone = await makeHarness();
    await h.app.close();
    h = gone;
    // Same secret in test config: the token verifies, but this gateway never created the session.
    const res = await post(cookie, clientText(1, sessionId));
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('unauthorized');
  });

  it('answers 403 for an event that carries another session id', async () => {
    h = await makeHarness();
    const { cookie } = await h.login();
    const res = await post(cookie, clientText(1, 'someone-elses-session'));
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('unauthorized');
  });

  it('answers 403 for a foreign Origin', async () => {
    h = await makeHarness();
    const { sessionId, cookie } = await h.login();
    const res = await post(cookie, clientText(1, sessionId), { origin: 'http://evil.example' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('unauthorized');
  });

  it('answers 400 invalid_schema for a malformed event without echoing the input', async () => {
    h = await makeHarness();
    const { sessionId, cookie } = await h.login();
    const bad = { ...clientText(1, sessionId), type: 'user.teleport' } as unknown as ClientEvent;
    const res = await post(cookie, bad);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_schema');
    expect(res.body).not.toContain('teleport');
  });

  it('does not echo an invalid enum value from the client', async () => {
    h = await makeHarness();
    const { sessionId, cookie } = await h.login();
    const bad = { ...clientTyping(1, sessionId), payload: { state: 'SECRET-xyz' } };
    const res = await post(cookie, bad);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_schema');
    for (const leak of ['SECRET-xyz', 'received', 'Expected']) expect(res.body).not.toContain(leak);
  });

  it('does not echo unrecognized key names from the client', async () => {
    h = await makeHarness();
    const { sessionId, cookie } = await h.login();
    const bad = {
      ...clientText(1, sessionId),
      payload: { text: 'oi', 'cpf-12345678900': 1 },
    };
    const res = await post(cookie, bad);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_schema');
    expect(res.body).not.toContain('cpf-12345678900');
  });

  it.each(['application/x-www-form-urlencoded', 'multipart/form-data; boundary=x'])(
    'answers 415 invalid_schema for content type %s',
    async (contentType) => {
      h = await makeHarness();
      const { sessionId, cookie } = await h.login();
      const res = await h.app.inject({
        method: 'POST',
        url: '/v1/events',
        headers: { 'content-type': contentType, cookie },
        payload: JSON.stringify(clientText(1, sessionId)),
      });
      expect(res.statusCode).toBe(415);
      expect(res.json().error.code).toBe('invalid_schema');
    },
  );

  it('accepts application/json with a charset parameter', async () => {
    h = await makeHarness();
    const { sessionId, cookie } = await h.login();
    const res = await post(cookie, clientText(1, sessionId), {
      'content-type': 'application/json; charset=utf-8',
    });
    expect(res.statusCode).toBe(202);
  });

  it('answers 400 invalid_schema for whitespace-only text', async () => {
    h = await makeHarness();
    const { sessionId, cookie } = await h.login();
    const res = await post(cookie, clientText(1, sessionId, '   '));
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_schema');
  });

  it('answers 400 invalid_schema for invalid JSON', async () => {
    h = await makeHarness();
    const { cookie } = await h.login();
    const res = await post(cookie, '{not json');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_schema');
  });

  it('answers 415 invalid_schema for a non-JSON content type', async () => {
    h = await makeHarness();
    const { sessionId, cookie } = await h.login();
    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { 'content-type': 'text/plain', cookie },
      payload: JSON.stringify(clientText(1, sessionId)),
    });
    expect(res.statusCode).toBe(415);
    expect(res.json().error.code).toBe('invalid_schema');
  });

  it('answers 413 payload_too_large above the body limit', async () => {
    h = await makeHarness();
    const { sessionId, cookie } = await h.login();
    const res = await post(cookie, clientText(1, sessionId, 'a'.repeat(70_000)));
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('payload_too_large');
  });

  it('answers 429 rate_limited with Retry-After when the session exceeds its budget', async () => {
    h = await makeHarness({
      env: { SESSION_RATE_CAPACITY: '2', SESSION_RATE_PER_SECOND: '0.001' },
    });
    const { sessionId, cookie } = await h.login();
    await post(cookie, clientTyping(1, sessionId));
    await post(cookie, clientTyping(2, sessionId));
    const res = await post(cookie, clientTyping(3, sessionId));
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe('rate_limited');
    expect(Number(res.headers['retry-after'])).toBeGreaterThanOrEqual(1);
  });

  it('answers 404 with the stable error shape for unknown routes', async () => {
    h = await makeHarness();
    const res = await h.app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('invalid_schema');
  });
});
