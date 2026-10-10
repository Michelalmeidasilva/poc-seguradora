import { Writable } from 'node:stream';
import pino from 'pino';
import { afterEach, describe, expect, it } from 'vitest';
import { createGateway, type Gateway, REQUEST_LOG_SERIALIZERS } from './compose';
import { clientText } from './test/fixtures';
import { testConfig } from './test/harness';

let gateway: Gateway;
afterEach(async () => {
  await gateway.app.close();
});

describe('request logging', () => {
  it('does not log the client IP or the remote port', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _enc, done) {
        lines.push(...chunk.toString('utf8').split('\n').filter(Boolean));
        done();
      },
    });
    const logger = pino({ level: 'info', serializers: REQUEST_LOG_SERIALIZERS }, stream);
    gateway = await createGateway(testConfig({ LOG_LEVEL: 'info' }), { logger });

    const ip = '203.0.113.77';
    const headers = { 'x-forwarded-for': ip };
    const session = await gateway.app.inject({ method: 'POST', url: '/v1/session', headers });
    const cookie = `sid=${session.cookies[0]?.value}`;
    const { sessionId } = session.json<{ sessionId: string }>();
    await gateway.app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { ...headers, cookie, 'content-type': 'application/json' },
      payload: JSON.stringify(clientText(1, sessionId)),
    });
    await gateway.app.inject({ method: 'GET', url: '/nope', headers });

    expect(lines.length).toBeGreaterThan(0);
    const all = lines.join('\n');
    expect(all).toContain('"method":"POST"');
    expect(all).not.toContain('remoteAddress');
    expect(all).not.toContain('remotePort');
    expect(all).not.toContain(ip);
    expect(all).not.toContain('127.0.0.1');
  });
});
