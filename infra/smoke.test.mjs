import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { createSseParser, openStream, runSmoke, SmokeError, waitForEvent } from './smoke.mjs';

describe('createSseParser', () => {
  it('parses id, event and JSON data across arbitrary chunk boundaries', () => {
    const events = [];
    const parser = createSseParser((e) => events.push(e));
    const raw =
      'retry: 3000\n\n: hb\n\nid: 1\nevent: message.text\ndata: {"type":"message.text","seq":1}\n\n' +
      'id: 2\r\nevent: status.typing\r\ndata: {"type":"status.typing","seq":2}\r\n\r\n';
    for (const ch of raw) parser.feed(ch);
    assert.deepEqual(events, [
      { id: '1', event: 'message.text', data: { type: 'message.text', seq: 1 } },
      { id: '2', event: 'status.typing', data: { type: 'status.typing', seq: 2 } },
    ]);
  });

  it('rejects data that is not JSON with an sse SmokeError', () => {
    const parser = createSseParser(() => undefined);
    assert.throws(
      () => parser.feed('id: 1\nevent: x\ndata: not-json\n\n'),
      (e) => e instanceof SmokeError && e.hop === 'sse' && /malformed/.test(e.message),
    );
  });
});

/** In-process server: each test registers what GET /stream answers. */
let server;
let base;
let handler = () => undefined;

before(async () => {
  server = createServer((req, res) => handler(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const sse = (res) => res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' });
const frame = (seq, type, extra = {}) =>
  `id: ${seq}\nevent: ${type}\ndata: ${JSON.stringify({ seq, type, ...extra })}\n\n`;

describe('openStream + waitForEvent', () => {
  it('resolves with the first matching event and forwards cookie and Last-Event-ID', async () => {
    let seen;
    handler = (req, res) => {
      seen = req.headers;
      sse(res);
      res.write('retry: 3000\n\n');
      res.write(frame(5, 'status.typing'));
      setTimeout(
        () => res.write(frame(6, 'message.quick_replies', { payload: { options: [] } })),
        50,
      );
    };
    const stream = await openStream(`${base}/stream`, {
      cookie: 'sid=abc',
      origin: 'http://localhost:8080',
      lastEventId: '4',
    });
    try {
      const e = await waitForEvent(stream, (ev) => ev.event === 'message.quick_replies', {
        hop: 'chatbot',
        what: 'message.quick_replies',
        timeoutMs: 2000,
      });
      assert.equal(e.id, '6');
      assert.equal(e.data.type, 'message.quick_replies');
      assert.equal(seen.cookie, 'sid=abc');
      assert.equal(seen['last-event-id'], '4');
      assert.equal(seen.origin, 'http://localhost:8080');
      assert.deepEqual(
        stream.events.map((x) => x.id),
        ['5', '6'],
      );
    } finally {
      stream.close();
    }
  });

  it('only looks at events from the given index on', async () => {
    handler = (_req, res) => {
      sse(res);
      res.write(frame(1, 'message.text'));
      setTimeout(() => res.write(frame(2, 'message.text')), 50);
    };
    const stream = await openStream(`${base}/stream`, {});
    try {
      await waitForEvent(stream, () => true, { hop: 'chatbot', what: 'x', timeoutMs: 2000 });
      const e = await waitForEvent(stream, (ev) => ev.event === 'message.text', {
        hop: 'chatbot',
        what: 'second text',
        from: 1,
        timeoutMs: 2000,
      });
      assert.equal(e.id, '2');
    } finally {
      stream.close();
    }
  });

  it('times out naming the hop and what it waited for', async () => {
    handler = (_req, res) => {
      sse(res);
      res.write(': hb\n\n');
    };
    const stream = await openStream(`${base}/stream`, {});
    try {
      await assert.rejects(
        waitForEvent(stream, (ev) => ev.event === 'message.flow', {
          hop: 'services',
          what: 'quote result',
          timeoutMs: 150,
        }),
        (e) =>
          e instanceof SmokeError &&
          e.hop === 'services' &&
          /quote result/.test(e.message) &&
          /150 ms/.test(e.message),
      );
    } finally {
      stream.close();
    }
  });

  it('fails with hop sse when the stream sends malformed data', async () => {
    handler = (_req, res) => {
      sse(res);
      res.write('id: 1\nevent: message.text\ndata: {broken\n\n');
    };
    const stream = await openStream(`${base}/stream`, {});
    try {
      await assert.rejects(
        waitForEvent(stream, () => true, { hop: 'chatbot', what: 'anything', timeoutMs: 2000 }),
        (e) => e instanceof SmokeError && e.hop === 'sse' && /malformed/.test(e.message),
      );
    } finally {
      stream.close();
    }
  });

  it('fails with hop sse when the stream ends before the event arrives', async () => {
    handler = (_req, res) => {
      sse(res);
      res.end(frame(1, 'status.typing'));
    };
    const stream = await openStream(`${base}/stream`, {});
    await assert.rejects(
      waitForEvent(stream, (ev) => ev.event === 'message.text', {
        hop: 'chatbot',
        what: 'text',
        timeoutMs: 2000,
      }),
      (e) => e instanceof SmokeError && e.hop === 'sse' && /closed/.test(e.message),
    );
  });

  it('rejects a non-200 answer with the status, naming the hop', async () => {
    handler = (_req, res) => {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end('{"error":{"code":"unauthorized"}}');
    };
    await assert.rejects(
      openStream(`${base}/stream`, { cookie: 'sid=bad' }),
      (e) => e instanceof SmokeError && e.hop === 'sse' && /401/.test(e.message),
    );
  });

  it('rejects a 200 answer that is not an event stream', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html></html>');
    };
    await assert.rejects(
      openStream(`${base}/stream`, {}),
      (e) => e instanceof SmokeError && e.hop === 'sse' && /text\/html/.test(e.message),
    );
  });
});

/** Minimal fake of web + gateway + chatbot, with configurable delays (ms) per hop. */
async function startFakeGateway(delays = {}) {
  const d = {
    page: 0,
    session: 0,
    stream: 0,
    events: 0,
    reply: 0,
    products: ['Assistência Funeral', 'Assistência Farmácia', 'Telemedicina'],
    additionalScreens: [],
    ...delays,
  };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const events = [];
  const requests = [];
  let live;
  const push = (type, payload) => {
    const seq = events.length + 1;
    const e = {
      v: 1,
      id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
      sessionId: 's1',
      correlationId: 'smoke',
      ts: new Date().toISOString(),
      seq,
      type,
      payload,
    };
    events.push(e);
    live?.write(`id: ${e.seq}\nevent: ${type}\ndata: ${JSON.stringify(e)}\n\n`);
  };
  const srv = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (path === '/') {
      await sleep(d.page);
      res.writeHead(200, {
        'content-type': 'text/html',
        'content-security-policy': "default-src 'self'",
      });
      return res.end('<html></html>');
    }
    if (path === '/v1/session') {
      await sleep(d.session);
      res.writeHead(201, { 'content-type': 'application/json', 'set-cookie': 'sid=abc; Path=/' });
      return res.end('{"sessionId":"s1"}');
    }
    if (path === '/v1/stream') {
      await sleep(d.stream);
      sse(res);
      res.write('retry: 1000\n\n'); // like the gateway: flushes the headers at once
      const last = Number(req.headers['last-event-id'] ?? 0);
      for (const e of events.filter((x) => x.seq > last)) {
        res.write(`id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
      }
      live = res;
      return undefined;
    }
    if (path === '/v1/events') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      requests.push(body);
      await sleep(d.events);
      res.writeHead(202, { 'content-type': 'application/json' });
      res.end('{"status":"accepted"}');
      await sleep(d.reply);
      if (body.payload.text === 'O que vocês oferecem?')
        push('message.flow', {
          flowId: 'DES-01',
          body: 'Conhecer produtos',
          ctaLabel: 'Selecionar uma opção',
          flowJson: {
            version: '7.1',
            screens: [
              {
                id: 'LIST',
                terminal: true,
                layout: {
                  type: 'SingleColumnLayout',
                  children: [
                    {
                      type: 'RadioButtonsGroup',
                      name: 'choice',
                      label: 'Conhecer produtos',
                      required: true,
                      'data-source': d.products.map((title, i) => ({ id: String(i), title })),
                    },
                  ],
                },
              },
              ...d.additionalScreens,
            ],
          },
        });
      else if (body.payload.text === 'Quero ver meu contrato.')
        push('message.quick_replies', {
          text: 'Informe o CPF demonstrativo',
          options: [{ id: 'IDE-08', title: 'Informar CPF' }],
        });
      else if (body.type === 'user.quick_reply' && body.payload.optionId === 'IDE-08')
        push('message.flow', {
          flowId: 'IDE-08',
          body: 'Informe o CPF',
          ctaLabel: 'Abrir formulário',
          flowJson: {},
        });
      else if (body.type === 'user.flow_submit' && body.payload.flowId === 'IDE-08')
        push('message.flow', {
          flowId: 'CON-01',
          body: 'Contrato demonstrativo',
          ctaLabel: 'Selecionar uma opção',
          flowJson: {},
        });
      else if (body.type === 'user.flow_submit' && body.payload.flowId === 'CON-01')
        push('message.quick_replies', {
          text: 'Contrato demonstrativo',
          options: [{ id: 'CON-07', title: 'Ver documentos' }],
        });
      else if (body.type === 'user.quick_reply' && body.payload.optionId === 'CON-07')
        push('message.document', {
          documents: [{ id: 'DOC-DEMO', title: 'Documento demonstrativo', status: 'available' }],
        });
      else
        push('message.quick_replies', {
          text: 'Escolha uma opção',
          options: [{ id: 'DES-01', title: 'Conhecer produtos' }],
        });
      return undefined;
    }
    res.writeHead(404);
    return res.end();
  });
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${srv.address().port}`,
    requests,
    close: () => {
      srv.closeAllConnections();
      return new Promise((resolve) => srv.close(resolve));
    },
  };
}

describe('runSmoke deadlines (scaled-down budgets)', () => {
  const budgets = { stepTimeoutMs: 400, globalTimeoutMs: 1500 };
  const quiet = () => undefined;

  /** Runs the smoke and returns { error, ms }. */
  async function timed(delays, opts = budgets) {
    const fake = await startFakeGateway(delays);
    const started = Date.now();
    try {
      await runSmoke(fake.url, { log: quiet, ...opts });
      return { error: undefined, ms: Date.now() - started };
    } catch (error) {
      return { error, ms: Date.now() - started };
    } finally {
      await fake.close();
    }
  }

  it('passes all seven steps against a fast stack', { timeout: 3000 }, async () => {
    const lines = [];
    const fake = await startFakeGateway();
    try {
      await runSmoke(fake.url, { log: (l) => lines.push(l), ...budgets });
      assert.ok(
        fake.requests.some(
          (event) => event.type === 'user.quick_reply' && event.payload.optionId === 'CON-07',
        ),
        'smoke must read mock documents after the CPF gate',
      );
    } finally {
      await fake.close();
    }
    assert.deepEqual(lines, [
      'ok web',
      'ok session',
      'ok stream',
      'ok chatbot',
      'ok assistance-products',
      'ok cpf-contract',
      'ok replay',
    ]);
  });

  it('accepts plans and final intents inside the discovery Flow without treating them as extra services', async () => {
    const fake = await startFakeGateway({
      additionalScreens: [
        {
          id: 'PLANS',
          layout: {
            children: [
              {
                type: 'RadioButtonsGroup',
                'data-source': [{ title: 'Individual' }, { title: 'Familiar' }],
              },
            ],
          },
        },
        {
          id: 'FINISH',
          layout: {
            children: [
              {
                type: 'RadioButtonsGroup',
                'data-source': [{ title: 'Concluir descoberta' }, { title: 'Iniciar contratação' }],
              },
            ],
          },
        },
      ],
    });
    try {
      await runSmoke(fake.url, { log: quiet, ...budgets });
    } finally {
      await fake.close();
    }
  });

  it('rejects a public catalog with services outside the three approved assistance services', async () => {
    const fake = await startFakeGateway({
      products: ['Assistência Funeral', 'Assistência Farmácia', 'Telemedicina', 'Seguro Auto'],
    });
    try {
      await assert.rejects(
        runSmoke(fake.url, { log: quiet, ...budgets }),
        (error) =>
          error instanceof SmokeError &&
          error.hop === 'chatbot' &&
          /three assistance services/.test(error.message),
      );
    } finally {
      await fake.close();
    }
  });

  it('shares one step deadline between the POST and the wait', { timeout: 3000 }, async () => {
    // POST 250 ms + reply 250 ms later: each fits 400 ms alone, together they do not.
    const { error, ms } = await timed({ events: 250, reply: 250 });
    assert.ok(error instanceof SmokeError, String(error));
    assert.equal(error.hop, 'chatbot');
    assert.match(error.message, /400 ms step budget/);
    assert.ok(ms >= 380 && ms < 550, `failed after ${ms} ms, expected ~400`);
  });

  it('names the session hop when the POST alone exceeds the step', { timeout: 3000 }, async () => {
    const { error, ms } = await timed({ events: 800 });
    assert.ok(error instanceof SmokeError, String(error));
    assert.equal(error.hop, 'session');
    assert.match(error.message, /timed out waiting for a response to POST \/v1\/events/);
    assert.ok(ms >= 380 && ms < 550, `failed after ${ms} ms, expected ~400`);
  });

  it('fails with the global budget across slow but passing steps', { timeout: 3000 }, async () => {
    // Every hop takes 150 ms (< 400 ms step), but seven steps exceed a 700 ms total.
    const delay = 150;
    const { error, ms } = await timed(
      { page: delay, session: delay, stream: delay, events: delay },
      { stepTimeoutMs: 400, globalTimeoutMs: 700 },
    );
    assert.ok(error instanceof SmokeError, String(error));
    assert.match(error.message, /^global smoke budget exceeded \(0\.7s\) while /);
    assert.ok(['chatbot', 'services', 'sse', 'session'].includes(error.hop), error.hop);
    assert.ok(ms >= 680 && ms < 850, `failed after ${ms} ms, expected ~700`);
  });
});
