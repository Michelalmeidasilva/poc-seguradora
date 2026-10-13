import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import pino from 'pino';
import { HandleTurn } from './application/handle-turn';
import type {
  AssistancePort,
  Clock,
  IdGenerator,
  LlmProvider,
  ServicesPort,
} from './application/ports';
import type { Config } from './config';
import { TurnLog } from './domain/turn-log';
import { buildApp } from './infra/http/app';
import { GuardedLlmProvider } from './infra/guarded-llm-provider';
import { InMemoryDialogStore } from './infra/in-memory-dialog-store';
import { MockLlmProvider } from './infra/mock-llm-provider';
import { MockAssistance } from './infra/mock-assistance';
import { HttpJsonClient } from './infra/services/http-json';
import { HttpServices } from './infra/services/http-services';
import { createServicePolicy } from './infra/services/services-policy';

/** Request logs carry method and url only (no client address, no headers, no body). */
export const REQUEST_LOG_SERIALIZERS = {
  req: (req: { method?: string; url?: string }) => ({ method: req.method, url: req.url }),
};

export interface ChatbotOverrides {
  services?: ServicesPort;
  assistance?: AssistancePort;
  llm?: LlmProvider;
  logger?: pino.Logger;
  now?: Clock;
}

export interface Chatbot {
  app: FastifyInstance;
  dialogs: InMemoryDialogStore;
  /** Typed seam consumed by the assistance-turn use case (Task 5). */
  assistance: AssistancePort;
}

/** Composition root: wires the adapters to the use case and the HTTP app. */
export async function createChatbot(
  config: Config,
  overrides: ChatbotOverrides = {},
): Promise<Chatbot> {
  const logger =
    overrides.logger ?? pino({ level: config.LOG_LEVEL, serializers: REQUEST_LOG_SERIALIZERS });
  const now: Clock = overrides.now ?? (() => Date.now());
  const newId: IdGenerator = () => randomUUID();

  const dialogs = new InMemoryDialogStore({
    capacity: config.SESSION_CAPACITY,
    ttlMs: config.SESSION_TTL_SECONDS * 1000,
    now,
  });

  const assistance =
    overrides.assistance ??
    new MockAssistance({
      capacity: config.SESSION_CAPACITY,
      ttlMs: config.SESSION_TTL_SECONDS * 1000,
      now,
    });

  const policy = () =>
    createServicePolicy({
      timeoutMs: config.SERVICE_TIMEOUT_MS,
      retries: config.SERVICE_RETRIES,
      retryBaseDelayMs: config.SERVICE_RETRY_BASE_MS,
      retryMaxDelayMs: config.SERVICE_RETRY_MAX_MS,
      breakerFailureThreshold: config.BREAKER_FAILURE_THRESHOLD,
      breakerResetMs: config.BREAKER_RESET_MS,
      bulkheadMaxConcurrent: config.BULKHEAD_MAX_CONCURRENT,
      bulkheadMaxQueue: config.BULKHEAD_MAX_QUEUE,
    });
  const client = (baseUrl: string) => new HttpJsonClient({ baseUrl, policy: policy(), logger });

  const services =
    overrides.services ??
    new HttpServices({
      cotacao: client(config.COTACAO_URL),
      apolice: client(config.APOLICE_URL),
      sinistro: client(config.SINISTRO_URL),
    });

  // A custom provider bypasses the guard (timeout, input cap): tests only.
  const llm =
    overrides.llm ??
    new GuardedLlmProvider(new MockLlmProvider(), {
      timeoutMs: config.LLM_TIMEOUT_MS,
      maxInputChars: config.LLM_MAX_INPUT_CHARS,
      logger,
    });

  const turns = new HandleTurn({
    llm,
    services,
    dialogs,
    turns: new TurnLog(config.TURN_LOG_CAPACITY),
    newId,
    now,
    logger,
  });

  const app = await buildApp({ turns, logger, shutdownGraceMs: config.SHUTDOWN_GRACE_MS });
  return { app, dialogs, assistance };
}
