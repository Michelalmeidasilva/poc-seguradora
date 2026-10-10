import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import pino from 'pino';
import { HandleClientEvent } from './application/handle-client-event';
import type { ChatbotPort, Clock, IdGenerator } from './application/ports';
import type { Config } from './config';
import { TokenBucket } from './domain/token-bucket';
import { createChatbotPolicy } from './infra/chatbot-policy';
import { buildApp } from './infra/http/app';
import { HttpChatbotClient } from './infra/http-chatbot-client';
import { InMemorySessionRegistry } from './infra/in-memory-session-registry';
import { JoseTokenService } from './infra/jose-token-service';

export interface GatewayOverrides {
  chatbot?: ChatbotPort;
  logger?: pino.Logger;
}

export interface Gateway {
  app: FastifyInstance;
  registry: InMemorySessionRegistry;
}

/** Composition root: wires the adapters to the use case and the HTTP app. */
export async function createGateway(
  config: Config,
  overrides: GatewayOverrides = {},
): Promise<Gateway> {
  const logger =
    overrides.logger ??
    pino({
      level: config.LOG_LEVEL,
      redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
    });
  const now: Clock = () => Date.now();
  const newId: IdGenerator = () => randomUUID();

  const registry = new InMemorySessionRegistry({
    maxSessions: config.MAX_SESSIONS,
    ttlMs: config.SESSION_TTL_SECONDS * 1000,
    bufferCapacity: config.BUFFER_CAPACITY,
    seenCapacity: config.SEEN_CAPACITY,
    newId,
    now,
  });
  const tokens = new JoseTokenService({
    secret: config.SESSION_SECRET,
    ttlSeconds: config.SESSION_TTL_SECONDS,
    now,
  });

  const chatbot =
    overrides.chatbot ??
    new HttpChatbotClient({
      baseUrl: config.CHATBOT_URL,
      turnTimeoutMs: config.CHATBOT_TURN_TIMEOUT_MS,
      policy: createChatbotPolicy({
        connectTimeoutMs: config.CHATBOT_CONNECT_TIMEOUT_MS,
        retries: config.CHATBOT_RETRIES,
        retryBaseDelayMs: config.CHATBOT_RETRY_BASE_MS,
        retryMaxDelayMs: config.CHATBOT_RETRY_MAX_MS,
        breakerFailureThreshold: config.BREAKER_FAILURE_THRESHOLD,
        breakerResetMs: config.BREAKER_RESET_MS,
        bulkheadMaxConcurrent: config.BULKHEAD_MAX_CONCURRENT,
        bulkheadMaxQueue: config.BULKHEAD_MAX_QUEUE,
      }),
    });

  const ipLimiter = new TokenBucket({
    capacity: config.IP_RATE_CAPACITY,
    refillPerSecond: config.IP_RATE_PER_SECOND,
  });
  const sessionLimiter = new TokenBucket({
    capacity: config.SESSION_RATE_CAPACITY,
    refillPerSecond: config.SESSION_RATE_PER_SECOND,
  });
  const handleClientEvent = new HandleClientEvent({
    chatbot,
    sessionLimiter,
    ipLimiter,
    newId,
    now,
    logger,
  });

  const app = await buildApp({ config, registry, tokens, handleClientEvent, ipLimiter, logger });
  return { app, registry };
}
