import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { createChatbot, REQUEST_LOG_SERIALIZERS } from './compose';
import { startFakeServices } from './test/fake-services';
import { testConfig, textReq } from './test/harness';

describe('request logging', () => {
  it('logs method and url only: no client address, headers or user text', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        lines.push(...String(chunk).split('\n').filter(Boolean));
        cb();
      },
    });
    const logger = pino({ level: 'info', serializers: REQUEST_LOG_SERIALIZERS }, stream);
    const fake = await startFakeServices();
    const { app } = await createChatbot(testConfig(fake.url), { logger });
    const userText = 'minhas apólices 123.456.789-01';
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/chat/events',
        remoteAddress: '203.0.113.77',
        headers: {
          cookie: 'session=cookie-secret-xyz',
          authorization: 'Bearer token-secret-xyz',
          'x-correlation-id': 'corr-distinctive-7f3a',
        },
        payload: textReq(userText),
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
      await fake.close();
    }
    const requestLine = lines.find((l) => l.includes('"method":"POST"'));
    expect(requestLine, `no request line among: ${lines.join('\n')}`).toBeDefined();
    expect(requestLine).toContain('"url":"/v1/chat/events"');
    const all = lines.join('\n');
    expect(all).not.toContain('remoteAddress');
    expect(all).not.toContain('203.0.113.77');
    expect(all).not.toContain('"headers"');
    expect(all).not.toContain('cookie-secret-xyz');
    expect(all).not.toContain('token-secret-xyz');
    expect(all).not.toContain('corr-distinctive-7f3a');
    expect(all).not.toContain('123.456.789-01');
    expect(all).not.toContain('12345678901');
    expect(all).not.toContain(userText);
  });
});
