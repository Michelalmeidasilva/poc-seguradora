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
import type { RateLimiter, SessionRegistry, TokenService } from '../../application/ports';
import type { Config } from '../../config';
import type { SessionState } from '../../domain/session-state';

export const SESSION_COOKIE = 'sid';

export type AppConfig = Pick<
  Config,
  | 'ALLOWED_ORIGIN'
  | 'COOKIE_SECURE'
  | 'COOKIE_SAME_SITE'
  | 'TRUST_PROXY'
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

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config, registry, tokens, handleClientEvent, ipLimiter, logger } = deps;

  const app: FastifyInstance = Fastify({
    loggerInstance: logger as FastifyBaseLogger,
    trustProxy: config.TRUST_PROXY,
    bodyLimit: LIMITS.maxEventBytes,
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

  app.post('/v1/session', { preHandler: requireAllowedOrigin }, async (request, reply) => {
    const limit = ipLimiter.take(`ip:${request.ip}`);
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
