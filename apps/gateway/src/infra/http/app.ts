import type { OutgoingHttpHeaders } from 'node:http';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import {
  err,
  LIMITS,
  ok,
  parseClientEvent,
  type ErrorCode,
  type Result,
} from '@seguradora/protocol';
import Fastify, {
  type FastifyBaseLogger,
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import type { Logger as PinoLogger } from 'pino';
import type { HandleClientEvent } from '../../application/handle-client-event';
import { openStream } from '../../application/open-stream';
import type { RateLimiter, SessionRegistry, TokenService } from '../../application/ports';
import type { Config } from '../../config';
import type { SessionState } from '../../domain/session-state';
import { formatSseEvent, parseLastEventId } from './sse';

export const SESSION_COOKIE = 'sid';

export type AppConfig = Pick<
  Config,
  | 'ALLOWED_ORIGIN'
  | 'COOKIE_SECURE'
  | 'COOKIE_SAME_SITE'
  | 'TRUST_PROXY_HOPS'
  | 'SESSION_TTL_SECONDS'
  | 'HEARTBEAT_MS'
  | 'SSE_RETRY_MS'
>;

export interface AppDeps {
  config: AppConfig;
  registry: SessionRegistry;
  tokens: TokenService;
  handleClientEvent: HandleClientEvent;
  ipLimiter: RateLimiter;
  /** Stricter per-IP limiter for `POST /v1/session` only. */
  sessionCreateLimiter: RateLimiter;
  logger: PinoLogger;
}

interface AuthFailure {
  status: 401 | 403;
  code: ErrorCode;
  message: string;
}

function describeStatus(status: number): { code: ErrorCode; message: string } {
  if (status === 413) return { code: 'payload_too_large', message: 'Mensagem grande demais.' };
  if (status === 429) return { code: 'rate_limited', message: 'Muitas requisições.' };
  if (status === 401 || status === 403) return { code: 'unauthorized', message: 'Não autorizado.' };
  if (status >= 400 && status < 500)
    return { code: 'invalid_schema', message: 'Requisição inválida.' };
  return { code: 'internal_error', message: 'Erro interno.' };
}

const summarizeIssue = (error: { issues: Array<{ path: PropertyKey[]; code: string }> }) => {
  const issue = error.issues[0];
  if (!issue) return 'Evento inválido.';
  const where = issue.path.map(String).join('.') || 'event';
  // Only path and issue code: zod messages can embed client-supplied values or key names.
  return `Evento inválido em ${where} (${issue.code}).`.slice(0, 200);
};

/** `i` counts hops from the socket peer (0): the first `hops` addresses are trusted proxies. */
const trustProxyHops = (hops: number) =>
  hops > 0 ? (_addr: string, i: number) => i < hops : false;

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config, registry, tokens, handleClientEvent, ipLimiter, sessionCreateLimiter, logger } =
    deps;

  const app: FastifyInstance = Fastify({
    loggerInstance: logger as FastifyBaseLogger,
    // Never `true`: the left-most X-Forwarded-For entry is client-controlled. Fastify's numeric
    // form fails closed (it never trusts), so the hop count is expressed as a function.
    trustProxy: trustProxyHops(config.TRUST_PROXY_HOPS),
    bodyLimit: LIMITS.maxEventBytes,
    // Node's closeIdleConnections() skips sockets that never carried a request
    // (pre-connected by browsers, proxies, undici), so close() would wait for the
    // peer. SSE streams are ended in preClose first; then every socket is destroyed.
    forceCloseConnections: true,
  });

  await app.register(cors, {
    origin: config.ALLOWED_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['content-type', 'last-event-id'],
    maxAge: 600,
  });
  await app.register(cookie);
  // Fastify parses text/plain by default; only JSON is accepted (others get 415).
  app.removeContentTypeParser('text/plain');

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('x-content-type-options', 'nosniff');
    if (!reply.hasHeader('cache-control')) reply.header('cache-control', 'no-store');
    return payload;
  });

  const deny = (
    reply: FastifyReply,
    status: number,
    code: ErrorCode,
    message: string,
    retryAfterMs?: number,
  ) => {
    if (retryAfterMs !== undefined) {
      reply.header('retry-after', String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
    }
    return reply.status(status).send({
      error: { code, message, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) },
    });
  };

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const status =
      typeof error.statusCode === 'number' && error.statusCode >= 400 ? error.statusCode : 500;
    if (status >= 500) request.log.error({ err: error }, 'unhandled error');
    const { code, message } = describeStatus(status);
    return deny(reply, status, code, message);
  });

  app.setNotFoundHandler((_request, reply) =>
    deny(reply, 404, 'invalid_schema', 'Rota não encontrada.'),
  );

  /** CSRF guard: browsers always send Origin on cross-site requests. */
  const requireAllowedOrigin = async (request: FastifyRequest, reply: FastifyReply) => {
    const origin = request.headers.origin;
    if (origin !== undefined && origin !== config.ALLOWED_ORIGIN) {
      return deny(reply, 403, 'unauthorized', 'Origem não permitida.');
    }
    return undefined;
  };

  /** General per-IP budget for the stream route (runs after the Origin check). */
  const limitStreamByIp = async (request: FastifyRequest, reply: FastifyReply) => {
    const limit = ipLimiter.take(`ip:${request.ip}`);
    if (limit.allowed) return undefined;
    return deny(
      reply,
      429,
      'rate_limited',
      'Muitas requisições. Aguarde um instante.',
      limit.retryAfterMs,
    );
  };

  async function authenticate(request: FastifyRequest): Promise<Result<SessionState, AuthFailure>> {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) return err({ status: 401, code: 'unauthorized', message: 'Sessão ausente.' });
    const verified = await tokens.verify(token);
    if (!verified.ok) {
      const message = verified.error === 'expired' ? 'Sessão expirada.' : 'Sessão inválida.';
      return err({ status: 401, code: 'unauthorized', message });
    }
    const session = registry.get(verified.value.sessionId);
    if (!session) return err({ status: 401, code: 'unauthorized', message: 'Sessão expirada.' });
    return ok(session);
  }

  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/ready', async () => ({ status: 'ready' }));

  /** sessionId → close function of its live SSE stream (one stream per session). */
  const streams = new Map<string, () => void>();

  app.addHook('preClose', async () => {
    for (const close of [...streams.values()]) close();
  });

  app.get(
    '/v1/stream',
    { preHandler: [requireAllowedOrigin, limitStreamByIp] },
    async (request, reply) => {
      const auth = await authenticate(request);
      if (!auth.ok) return deny(reply, auth.error.status, auth.error.code, auth.error.message);
      const session = auth.value;
      registry.markActive(session.sessionId);
      const lastSeq = parseLastEventId(request.headers['last-event-id']);

      // A reconnect replaces the previous stream of the same session.
      streams.get(session.sessionId)?.();

      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        ...(reply.getHeaders() as OutgoingHttpHeaders),
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        'x-content-type-options': 'nosniff',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      raw.write(`retry: ${config.SSE_RETRY_MS}\n\n`);

      let closed = false;
      let unsubscribe = (): void => undefined;
      const timers: { heartbeat?: NodeJS.Timeout } = {};

      const close = (): void => {
        if (closed) return;
        closed = true;
        if (timers.heartbeat) clearInterval(timers.heartbeat);
        unsubscribe();
        if (streams.get(session.sessionId) === close) streams.delete(session.sessionId);
        if (!raw.writableEnded) raw.end();
      };
      const write = (chunk: string): void => {
        try {
          raw.write(chunk);
        } catch (error) {
          request.log.warn({ err: error }, 'sse write failed');
          close();
        }
      };

      streams.set(session.sessionId, close);
      request.raw.on('close', close);
      raw.on('close', close);
      // The client may have gone while we were authenticating; 'close' does not fire again.
      if (request.raw.destroyed || raw.destroyed) {
        close();
        return;
      }

      const handle = openStream(session, lastSeq, (event) => write(formatSseEvent(event)));
      unsubscribe = handle.unsubscribe;
      if (handle.gap) {
        request.log.warn({ sessionId: session.sessionId, lastSeq }, 'sse replay gap');
      }
      if (closed) {
        unsubscribe();
        return;
      }
      timers.heartbeat = setInterval(() => {
        registry.touch(session.sessionId);
        write(': hb\n\n');
      }, config.HEARTBEAT_MS);
    },
  );

  app.post('/v1/session', { preHandler: requireAllowedOrigin }, async (request, reply) => {
    const limit = sessionCreateLimiter.take(`ip:${request.ip}`);
    if (!limit.allowed) {
      return deny(
        reply,
        429,
        'rate_limited',
        'Muitas requisições. Aguarde um instante.',
        limit.retryAfterMs,
      );
    }
    const session = registry.create();
    if (!session) {
      return deny(
        reply,
        429,
        'rate_limited',
        'Capacidade esgotada. Tente novamente em instantes.',
        5000,
      );
    }
    const token = await tokens.issue(session.sessionId);
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: config.COOKIE_SECURE,
      sameSite: config.COOKIE_SAME_SITE,
      path: '/',
      maxAge: config.SESSION_TTL_SECONDS,
    });
    return reply.status(201).send({ sessionId: session.sessionId });
  });

  app.post('/v1/events', { preHandler: requireAllowedOrigin }, async (request, reply) => {
    const auth = await authenticate(request);
    if (!auth.ok) return deny(reply, auth.error.status, auth.error.code, auth.error.message);

    const parsed = parseClientEvent(request.body);
    if (!parsed.ok) return deny(reply, 400, 'invalid_schema', summarizeIssue(parsed.error));
    if (parsed.value.sessionId !== auth.value.sessionId) {
      return deny(reply, 403, 'unauthorized', 'Sessão inválida.');
    }

    const result = handleClientEvent.handle(auth.value, parsed.value, request.ip);
    if (result.status !== 'rate_limited') registry.markActive(auth.value.sessionId);
    switch (result.status) {
      case 'accepted':
        return reply.status(202).send({ status: 'accepted' });
      case 'duplicate':
        return reply.status(200).send({ status: 'duplicate' });
      case 'rate_limited':
        return deny(
          reply,
          429,
          'rate_limited',
          'Muitas mensagens. Aguarde um instante.',
          result.retryAfterMs,
        );
    }
  });

  return app;
}
