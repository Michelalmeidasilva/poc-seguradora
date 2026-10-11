import {
  ChatbotRequestSchema,
  LIMITS,
  serializeChatbotLine,
  type ErrorCode,
} from '@seguradora/protocol';
import Fastify, {
  type FastifyBaseLogger,
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
} from 'fastify';
import type { Logger as PinoLogger } from 'pino';
import type { TurnRunner } from '../../application/ports';

export interface AppDeps {
  turns: TurnRunner;
  logger: PinoLogger;
  /**
   * On close, how long to wait for in-flight turns and their responses before the connections
   * are force-closed. Must stay below the platform's SIGTERM-to-SIGKILL window.
   */
  shutdownGraceMs: number;
}

function describeStatus(status: number): { code: ErrorCode; message: string } {
  if (status === 413) return { code: 'payload_too_large', message: 'Request too large.' };
  if (status === 429) return { code: 'rate_limited', message: 'Too many requests.' };
  if (status === 401 || status === 403) return { code: 'unauthorized', message: 'Not authorized.' };
  if (status >= 400 && status < 500) return { code: 'invalid_schema', message: 'Invalid request.' };
  return { code: 'internal_error', message: 'Internal error.' };
}

/** Message built from the path and code of the first issue only: never echoes the input. */
const summarizeIssue = (error: { issues: Array<{ path: PropertyKey[]; code: string }> }) => {
  const issue = error.issues[0];
  if (!issue) return 'Invalid request.';
  const where = issue.path.map(String).join('.') || 'request';
  return `Invalid request at ${where} (${issue.code}).`.slice(0, 200);
};

/** Waits until the response can take more data, or the client is gone. */
const drained = (raw: NodeJS.WritableStream & { destroyed?: boolean }) =>
  new Promise<void>((resolve) => {
    const done = () => {
      raw.removeListener('drain', done);
      raw.removeListener('close', done);
      resolve();
    };
    raw.on('drain', done);
    raw.on('close', done);
  });

/** Resolves when every promise settled or after `ms`, whichever comes first. Never rejects. */
async function settleWithin(promises: Iterable<Promise<unknown>>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  try {
    await Promise.race([Promise.allSettled([...promises]), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function buildApp({
  turns,
  logger,
  shutdownGraceMs,
}: AppDeps): Promise<FastifyInstance> {
  const app: FastifyInstance = Fastify({
    loggerInstance: logger as FastifyBaseLogger,
    // The request wraps one client event, so allow twice the event limit.
    bodyLimit: LIMITS.maxEventBytes * 2,
    // After the preClose drain below, whatever is still open is cut (idle sockets included).
    forceCloseConnections: true,
  });

  // Responses still being written (a finished turn may have lines left to send).
  const streaming = new Set<Promise<void>>();

  // Runs after the routes stop accepting requests and before the connections are force-closed.
  app.addHook('preClose', async () => {
    const deadline = Date.now() + shutdownGraceMs;
    await turns.drain?.(shutdownGraceMs);
    await settleWithin(streaming, Math.max(0, deadline - Date.now()));
  });

  // Only JSON is accepted (Fastify also parses text/plain by default).
  app.removeContentTypeParser('text/plain');

  const deny = (reply: FastifyReply, status: number, code: ErrorCode, message: string) =>
    reply.status(status).send({ error: { code, message } });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const status =
      typeof error.statusCode === 'number' && error.statusCode >= 400 ? error.statusCode : 500;
    if (status >= 500) request.log.error({ err: { name: error.name } }, 'unhandled error');
    const { code, message } = describeStatus(status);
    return deny(reply, status, code, message);
  });
  app.setNotFoundHandler((_request, reply) =>
    deny(reply, 404, 'invalid_schema', 'Route not found.'),
  );

  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/ready', async () => ({ status: 'ready' }));

  app.post('/v1/chat/events', async (request, reply) => {
    const parsed = ChatbotRequestSchema.safeParse(request.body);
    if (!parsed.success) return deny(reply, 400, 'invalid_schema', summarizeIssue(parsed.error));

    // Headers first: the gateway's connect timeout only covers the time until the headers.
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'content-type': 'application/x-ndjson',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    raw.flushHeaders();

    let clientGone = false;
    raw.on('close', () => {
      clientGone = true;
    });

    let failed = false;
    let streamed: () => void = () => undefined;
    const done = new Promise<void>((resolve) => (streamed = resolve));
    streaming.add(done);
    try {
      for await (const event of turns.run(parsed.data)) {
        if (clientGone) break; // the turn keeps running; only the writing stops
        if (!raw.write(serializeChatbotLine(event))) await drained(raw);
      }
    } catch (error) {
      failed = true;
      request.log.error(
        { err: error instanceof Error ? { name: error.name } : { name: 'UnknownError' } },
        'turn stream failed after the headers were sent',
      );
    } finally {
      // On failure, abort without the terminating chunk so the gateway sees a broken stream.
      if (failed) raw.destroy();
      else if (!raw.writableEnded) raw.end();
      streaming.delete(done);
      streamed();
    }
  });

  return app;
}
