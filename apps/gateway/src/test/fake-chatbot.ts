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
  correlationId: request.correlationId,
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
      const parsed = ChatbotRequestSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        res.writeHead(400);
        res.end();
        return;
      }
      fake.requests.push(parsed.data);
      fake.headers.push(req.headers);
      await behavior(parsed.data, res);
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
