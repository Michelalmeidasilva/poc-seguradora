#!/usr/bin/env node
// End-to-end smoke of the current assistance experience: web -> gateway -> chatbot -> mock.
// Usage: node infra/smoke.mjs <base-url>   (or BASE_URL=<base-url> node infra/smoke.mjs)
// Each step prints `ok <step>`; the first failure prints `FAIL <hop>: <reason>` and exits 1.
// Hops: web (nginx/static), session (gateway session/cookie/Origin), sse (event stream),
// chatbot (gateway -> chatbot turn), assistance (personal CPF gate and session mock).
// No dependencies: Node 22 fetch only.
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const STEP_TIMEOUT_MS = 10_000;
export const GLOBAL_TIMEOUT_MS = 55_000;

/** A failure attributed to one hop of the chain. */
export class SmokeError extends Error {
  constructor(hop, reason) {
    super(reason);
    this.name = 'SmokeError';
    this.hop = hop;
  }
}

/**
 * Incremental SSE parser (id / event / data fields; comments and retry ignored).
 * Calls onEvent({ id, event, data }) with `data` parsed as JSON; throws SmokeError('sse') when
 * the data of an event is not JSON.
 */
export function createSseParser(onEvent) {
  let buffer = '';
  let current = { id: undefined, event: undefined, data: [] };

  const dispatch = () => {
    const { id, event, data } = current;
    current = { id: undefined, event: undefined, data: [] };
    if (data.length === 0) return;
    const text = data.join('\n');
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new SmokeError('sse', `malformed SSE data (not JSON): ${text.slice(0, 80)}`);
    }
    onEvent({ id, event, data: parsed });
  };

  const line = (raw) => {
    if (raw === '') return dispatch();
    if (raw.startsWith(':')) return undefined;
    const colon = raw.indexOf(':');
    const field = colon === -1 ? raw : raw.slice(0, colon);
    let value = colon === -1 ? '' : raw.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'id') current.id = value;
    else if (field === 'event') current.event = value;
    else if (field === 'data') current.data.push(value);
    return undefined;
  };

  return {
    feed(chunk) {
      buffer += chunk;
      for (;;) {
        const match = /\r\n|\r|\n/.exec(buffer);
        // A lone trailing \r may be the first half of \r\n: wait for the next chunk.
        if (!match || (match[0] === '\r' && match.index === buffer.length - 1)) return;
        const raw = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        line(raw);
      }
    },
  };
}

/**
 * Opens an SSE stream. Resolves once the response headers are in (200 + text/event-stream),
 * then keeps reading in the background. `events` collects every parsed event in order.
 * `timeoutMs` bounds only the wait for the headers; `onTimeout` builds the error to throw then.
 */
export async function openStream(
  url,
  { cookie, origin, lastEventId, hop = 'sse', timeoutMs = STEP_TIMEOUT_MS, onTimeout } = {},
) {
  const path = new URL(url).pathname;
  const controller = new AbortController();
  const headers = { accept: 'text/event-stream' };
  if (cookie) headers.cookie = cookie;
  if (origin) headers.origin = origin;
  if (lastEventId !== undefined) headers['last-event-id'] = String(lastEventId);

  let timedOut = false;
  const connectTimer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  let res;
  try {
    res = await fetch(url, { headers, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      throw onTimeout?.() ?? new SmokeError(hop, `GET ${path} timed out after ${timeoutMs} ms`);
    }
    throw new SmokeError(hop, `GET ${path} failed: ${describe(error)}`);
  } finally {
    clearTimeout(connectTimer);
  }
  const type = res.headers.get('content-type') ?? '';
  if (res.status !== 200 || !type.startsWith('text/event-stream')) {
    controller.abort();
    throw new SmokeError(hop, `GET ${path} returned ${res.status} (${type || 'no content-type'})`);
  }

  const stream = {
    events: [],
    error: undefined,
    ended: false,
    listeners: new Set(),
    close: () => controller.abort(),
  };
  const notify = () => {
    for (const listener of [...stream.listeners]) listener();
  };
  const parser = createSseParser((event) => {
    stream.events.push(event);
    notify();
  });

  (async () => {
    const decoder = new TextDecoder();
    try {
      for await (const chunk of res.body) parser.feed(decoder.decode(chunk, { stream: true }));
    } catch (error) {
      if (error instanceof SmokeError) stream.error = error;
      else if (!controller.signal.aborted) {
        stream.error = new SmokeError(hop, `stream read failed: ${describe(error)}`);
      }
    }
    stream.ended = true;
    notify();
  })();

  return stream;
}

/**
 * Waits for the first event at index >= `from` matching `predicate`. On timeout, rejects with
 * `onTimeout()` or SmokeError(hop) naming what it waited for; a malformed or closed stream is
 * an `sse` failure.
 */
export function waitForEvent(
  stream,
  predicate,
  { hop, what, from = 0, timeoutMs = STEP_TIMEOUT_MS, onTimeout },
) {
  return new Promise((resolve, reject) => {
    let timer;
    const done = (fn, value) => {
      clearTimeout(timer);
      stream.listeners.delete(check);
      fn(value);
    };
    function check() {
      const found = stream.events.slice(from).find(predicate);
      if (found) return done(resolve, found);
      if (stream.error) return done(reject, stream.error);
      if (stream.ended) {
        return done(reject, new SmokeError('sse', `stream closed before ${what} arrived`));
      }
      return undefined;
    }
    timer = setTimeout(
      () => done(reject, onTimeout?.() ?? new SmokeError(hop, `no ${what} within ${timeoutMs} ms`)),
      timeoutMs,
    );
    stream.listeners.add(check);
    check();
  });
}

const describe = (error) =>
  error?.cause?.code ?? error?.cause?.message ?? error?.message ?? String(error);

/**
 * The deadline of one step: the earlier of its own budget and the global budget. Every request
 * and wait of the step uses `remaining()`, so the step as a whole never exceeds its budget.
 */
function createDeadline(hop, stepMs, globalEnd, globalMs) {
  const stepEnd = Date.now() + stepMs;
  const end = Math.min(stepEnd, globalEnd);
  const byGlobal = globalEnd < stepEnd;
  return {
    hop,
    remaining: () => Math.max(1, end - Date.now()),
    /**
     * The error for running out of time while `doing`: a step timeout is attributed to the
     * operation's hop (`opHop`), the global budget to the hop of the step in progress.
     */
    expired: (doing, opHop = hop) =>
      byGlobal
        ? new SmokeError(hop, `global smoke budget exceeded (${globalMs / 1000}s) while ${doing}`)
        : new SmokeError(opHop, `timed out ${doing} (${stepMs} ms step budget)`),
  };
}

/** fetch bounded by the step deadline; failures and timeouts are attributed to `hop`. */
async function request(deadline, hop, url, init = {}) {
  const what = `${init.method ?? 'GET'} ${new URL(url).pathname}`;
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(deadline.remaining()) });
  } catch (error) {
    if (error?.name === 'TimeoutError')
      throw deadline.expired(`waiting for a response to ${what}`, hop);
    throw new SmokeError(hop, `${what} failed: ${describe(error)}`);
  }
}

/**
 * Runs the seven steps against `baseUrl`; throws SmokeError on the first failure. Each step has
 * one deadline (`stepTimeoutMs`) shared by its requests and its wait, and the whole run has one
 * global deadline (`globalTimeoutMs`) folded into every step's deadline.
 */
export async function runSmoke(
  baseUrl,
  { log = console.log, stepTimeoutMs = STEP_TIMEOUT_MS, globalTimeoutMs = GLOBAL_TIMEOUT_MS } = {},
) {
  const base = baseUrl.replace(/\/+$/, '');
  const origin = new URL(base).origin;
  const globalEnd = Date.now() + globalTimeoutMs;
  const streams = [];
  let sessionId;
  let cookie;
  let stream;

  /** Runs one step under its deadline; unexpected errors are attributed to the step's hop. */
  const step = async (hop, fn) => {
    const deadline = createDeadline(hop, stepTimeoutMs, globalEnd, globalTimeoutMs);
    try {
      await fn(deadline);
    } catch (error) {
      if (error instanceof SmokeError) throw error;
      if (error?.name === 'TimeoutError') throw deadline.expired('reading a response');
      throw new SmokeError(hop, describe(error));
    }
  };

  const postEvent = async (deadline, type, payload) => {
    const id = randomUUID();
    const res = await request(deadline, 'session', `${base}/v1/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, cookie },
      body: JSON.stringify({
        v: 1,
        id,
        sessionId,
        correlationId: `smoke-${id}`,
        ts: new Date().toISOString(),
        type,
        payload,
      }),
    });
    await res.arrayBuffer();
    if (res.status !== 202 && res.status !== 200) {
      throw new SmokeError('session', `POST /v1/events (${type}) returned ${res.status}`);
    }
  };

  /** Waits for an event within what is left of the step. */
  const expect = (deadline, s, predicate, what, from) =>
    waitForEvent(s, predicate, {
      hop: deadline.hop,
      what,
      from,
      timeoutMs: deadline.remaining(),
      onTimeout: () => deadline.expired(`waiting for ${what}`),
    });

  const connect = (deadline, lastEventId) =>
    openStream(`${base}/v1/stream`, {
      cookie,
      origin,
      lastEventId,
      timeoutMs: deadline.remaining(),
      onTimeout: () => deadline.expired('waiting for a response to GET /v1/stream', 'sse'),
    });

  try {
    // 1. Static web app with its security headers.
    await step('web', async (deadline) => {
      const res = await request(deadline, 'web', `${base}/`);
      const type = res.headers.get('content-type') ?? '';
      await res.text();
      if (res.status !== 200) throw new SmokeError('web', `GET / returned ${res.status}`);
      if (!type.includes('text/html')) throw new SmokeError('web', `GET / content-type ${type}`);
      if (!res.headers.get('content-security-policy')) {
        throw new SmokeError('web', 'GET / has no Content-Security-Policy header');
      }
      log('ok web');
    });

    // 2. Session through the /v1 proxy.
    await step('session', async (deadline) => {
      const res = await request(deadline, 'session', `${base}/v1/session`, {
        method: 'POST',
        headers: { origin },
      });
      const text = await res.text();
      if (res.status !== 201 && res.status !== 200) {
        throw new SmokeError('session', `POST /v1/session returned ${res.status}`);
      }
      let body = {};
      try {
        body = JSON.parse(text);
      } catch {
        // reported below as a missing sessionId
      }
      if (typeof body.sessionId !== 'string') {
        throw new SmokeError('session', 'POST /v1/session answered without sessionId');
      }
      const sid = res.headers
        .getSetCookie()
        .map((c) => c.split(';')[0])
        .find((c) => c.startsWith('sid='));
      if (!sid) throw new SmokeError('session', 'POST /v1/session set no sid cookie');
      sessionId = body.sessionId;
      cookie = sid;
      log('ok session');
    });

    // 3. Event stream with the session cookie.
    await step('sse', async (deadline) => {
      stream = await connect(deadline);
      streams.push(stream);
      log('ok stream');
    });

    // 4. A greeting reaches the chatbot and the menu comes back.
    await step('chatbot', async (deadline) => {
      const from = stream.events.length;
      await postEvent(deadline, 'user.text', { text: 'oi' });
      await expect(
        deadline,
        stream,
        (e) => e.event === 'message.quick_replies',
        'message.quick_replies answering "oi"',
        from,
      );
      log('ok chatbot');
    });

    // 5. Public discovery contains exactly the approved assistance services.
    await step('chatbot', async (deadline) => {
      const from = stream.events.length;
      await postEvent(deadline, 'user.text', { text: 'O que vocês oferecem?' });
      const catalog = await expect(
        deadline,
        stream,
        (e) => e.event === 'message.flow' && e.data?.payload?.flowId === 'DES-01',
        'public assistance catalog DES-01',
        from,
      );
      const screens = catalog.data?.payload?.flowJson?.screens;
      const options = Array.isArray(screens)
        ? screens
            .flatMap((screen) => screen.layout?.children ?? [])
            .filter((component) => component.type === 'RadioButtonsGroup')
            .flatMap((component) => component['data-source'] ?? [])
            .map((option) => option.title)
        : [];
      if (
        options.sort().join('|') !==
        ['Assistência Farmácia', 'Assistência Funeral', 'Telemedicina'].join('|')
      ) {
        throw new SmokeError(
          'chatbot',
          'catalog must contain exactly the three assistance services',
        );
      }
      log('ok assistance-products');
    });

    // 6. Personal access requires CPF format, then resumes the requested contract.
    await step('assistance', async (deadline) => {
      let from = stream.events.length;
      await postEvent(deadline, 'user.text', { text: 'Quero ver meu contrato.' });
      const gate = await expect(
        deadline,
        stream,
        (e) =>
          e.event === 'message.quick_replies' &&
          e.data?.payload?.options?.some((option) => option.id === 'IDE-08'),
        'CPF gate before contract',
        from,
      );
      from = stream.events.length;
      await postEvent(deadline, 'user.quick_reply', {
        optionId: 'IDE-08',
        replyToId: gate.data.id,
      });
      await expect(
        deadline,
        stream,
        (e) => e.event === 'message.flow' && e.data?.payload?.flowId === 'IDE-08',
        'single CPF form',
        from,
      );
      from = stream.events.length;
      await postEvent(deadline, 'user.flow_submit', {
        flowId: 'IDE-08',
        data: { cpf: '11111111111' },
      });
      await expect(
        deadline,
        stream,
        (e) => e.event === 'message.flow' && e.data?.payload?.flowId === 'CON-01',
        'contract after CPF format gate',
        from,
      );
      from = stream.events.length;
      await postEvent(deadline, 'user.flow_submit', { flowId: 'CON-01', data: { choice: '0' } });
      const contract = await expect(
        deadline,
        stream,
        (e) =>
          e.event === 'message.quick_replies' &&
          e.data?.payload?.options?.some((option) => option.id === 'CON-07'),
        'documents offered by the selected contract',
        from,
      );
      from = stream.events.length;
      await postEvent(deadline, 'user.quick_reply', {
        optionId: 'CON-07',
        replyToId: contract.data.id,
      });
      await expect(
        deadline,
        stream,
        (e) =>
          e.event === 'message.document' &&
          Array.isArray(e.data?.payload?.documents) &&
          e.data.payload.documents.length > 0,
        'mock documents after CPF and contract selection',
        from,
      );
      log('ok cpf-contract');
    });

    // 7. Reconnect with Last-Event-ID of the first event: every later event is replayed.
    await step('sse', async (deadline) => {
      const first = stream.events.find((e) => e.id !== undefined);
      const later = stream.events.filter((e) => e.id !== undefined && e !== first).map((e) => e.id);
      if (!first || later.length === 0) throw new SmokeError('sse', 'no event ids to replay');
      stream.close();
      const replay = await connect(deadline, first.id);
      streams.push(replay);
      const last = later[later.length - 1];
      await expect(
        deadline,
        replay,
        (e) => e.id === last,
        `replay up to event ${last} after Last-Event-ID ${first.id}`,
      );
      const replayed = replay.events.filter((e) => e.id !== undefined).map((e) => e.id);
      const head = replayed.slice(0, later.length);
      if (head.join(',') !== later.join(',')) {
        throw new SmokeError('sse', `replay ${head.join(',')} differs from ${later.join(',')}`);
      }
      log('ok replay');
    });
  } finally {
    for (const s of streams) s.close();
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const baseUrl = process.argv[2] ?? process.env.BASE_URL;
  if (!baseUrl) {
    console.error('usage: node infra/smoke.mjs <base-url>   (or BASE_URL=<base-url>)');
    process.exit(2);
  }
  const started = Date.now();
  try {
    await runSmoke(baseUrl);
    console.log(`smoke passed in ${Date.now() - started} ms`);
  } catch (error) {
    const hop = error instanceof SmokeError ? error.hop : 'web';
    console.error(`FAIL ${hop}: ${error?.message ?? error}`);
    process.exit(1);
  }
}
