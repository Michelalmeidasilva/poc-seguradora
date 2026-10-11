import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { createSseParser, openStream, SmokeError, waitForEvent } from './smoke.mjs';

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
