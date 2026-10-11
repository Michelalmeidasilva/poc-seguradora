import { randomUUID } from 'node:crypto';
import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  ChatbotRequestSchema,
  serializeChatbotLine,
  type ChatbotRequest,
  type UnsequencedServerEvent,
} from '@seguradora/protocol';

export type Behavior = (req: ChatbotRequest, res: ServerResponse) => void | Promise<void>;

export interface FakeChatbot {
  url: string;
  /** Valid requests received, in order. */
  requests: ChatbotRequest[];
  /** Headers of the valid requests, in the same order. */
  headers: IncomingHttpHeaders[];
  /** Every HTTP request that reached the server, including rejected ones. */
  hits: number;
  setBehavior(behavior: Behavior): void;
  close(): Promise<void>;
}

export const textEvent = (request: ChatbotRequest, text: string): UnsequencedServerEvent => ({
  v: 1,
  id: randomUUID(),
  sessionId: request.sessionId,
  // Replies are strictly validated by the gateway: never echo a non header-safe id.
  correlationId: /^[\x21-\x7e]{1,128}$/.test(request.correlationId)
    ? request.correlationId
    : 'fake-corr',
  ts: new Date().toISOString(),
  type: 'message.text',
  payload: { text },
});

export const replyText =
  (text: string): Behavior =>
  (request, res) => {
    res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    res.write(serializeChatbotLine(textEvent(request, text)));
    res.end();
  };

export const failWith =
  (status: number): Behavior =>
  (_request, res) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end('{"error":"fake failure"}');
  };

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

export async function startFakeChatbot(initial: Behavior = replyText('ok')): Promise<FakeChatbot> {
  let behavior = initial;
  const fake: FakeChatbot = {
    url: '',
    requests: [],
    headers: [],
    hits: 0,
    setBehavior: (b) => {
      behavior = b;
    },
    close: () => Promise.resolve(),
  };

  const server: Server = createServer((req, res) => {
    fake.hits++;
    void readBody(req).then(async (raw) => {
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        res.writeHead(400);
        res.end();
        return;
      }
      // Strict validation rejects non-header-safe correlation ids, which the gateway must still be
      // able to send (second guard). Tolerate ONLY that: retry with the correlationId replaced and
      // record the request with the original id; any other schema break is a 400.
      let request: ChatbotRequest;
      const strict = ChatbotRequestSchema.safeParse(json);
      if (strict.success) {
        request = strict.data;
      } else {
        const original =
          typeof json === 'object' && json !== null
            ? (json as { correlationId?: unknown }).correlationId
            : undefined;
        const retry =
          typeof original === 'string'
            ? ChatbotRequestSchema.safeParse({ ...(json as object), correlationId: 'fake-corr' })
            : undefined;
        if (!retry?.success || typeof original !== 'string') {
          res.writeHead(400);
          res.end();
          return;
        }
        request = { ...retry.data, correlationId: original };
      }
      fake.requests.push(request);
      fake.headers.push(req.headers);
      await behavior(request, res);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  fake.close = () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  return fake;
}
