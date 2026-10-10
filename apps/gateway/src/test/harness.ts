import type { ChatbotRequest, UnsequencedServerEvent } from '@seguradora/protocol';
import pino from 'pino';
import type { AddressInfo } from 'node:net';
import type { ChatbotPort } from '../application/ports';
import { createGateway } from '../compose';
import { loadConfig, type Config } from '../config';
import { textEvent } from './fake-chatbot';

export const testConfig = (overrides: Record<string, string> = {}): Config => {
  const r = loadConfig({
    CHATBOT_URL: 'http://127.0.0.1:1',
    SESSION_SECRET: 'x'.repeat(32),
    ALLOWED_ORIGIN: 'http://localhost:5173',
    COOKIE_SECURE: 'false',
    COOKIE_SAME_SITE: 'lax',
    TRUST_PROXY: 'false',
    HEARTBEAT_MS: '50',
    LOG_LEVEL: 'silent',
    ...overrides,
  });
  if (!r.ok) throw new Error(`invalid test config: ${r.error.join('; ')}`);
  return r.value;
};

/** In-memory chatbot: echoes user text and records what it receives. */
export function scriptedChatbot() {
  const requests: ChatbotRequest[] = [];
  const chatbot: ChatbotPort = {
    async send(request) {
      requests.push(request);
      async function* replies(): AsyncGenerator<UnsequencedServerEvent> {
        if (request.event.type === 'user.text') {
          yield textEvent(request, `echo: ${request.event.payload.text}`);
        }
      }
      return replies();
    },
  };
  return { chatbot, requests };
}

export interface HarnessOptions {
  chatbot?: ChatbotPort;
  env?: Record<string, string>;
}

export async function makeHarness(opts: HarnessOptions = {}) {
  const config = testConfig(opts.env);
  const scripted = scriptedChatbot();
  const chatbot = opts.chatbot ?? scripted.chatbot;
  const { app, registry } = await createGateway(config, {
    chatbot,
    logger: pino({ level: 'silent' }),
  });

  /** Opens a session through the real route and returns the cookie header to reuse. */
  async function login(headers: Record<string, string> = {}) {
    const res = await app.inject({ method: 'POST', url: '/v1/session', headers });
    const sid = res.cookies.find((c) => c.name === 'sid');
    if (res.statusCode !== 201 || !sid) {
      throw new Error(`login failed: ${res.statusCode} ${res.body}`);
    }
    const body = res.json<{ sessionId: string }>();
    return { sessionId: body.sessionId, cookie: `sid=${sid.value}`, response: res };
  }

  async function listen(): Promise<string> {
    await app.listen({ port: 0, host: '127.0.0.1' });
    return `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  }

  return { app, registry, config, chatbot, requests: scripted.requests, login, listen };
}
