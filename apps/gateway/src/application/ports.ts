import type { ChatbotRequest, Result, UnsequencedServerEvent } from '@seguradora/protocol';
import type { SessionState } from '../domain/session-state';

export interface ChatbotPort {
  /**
   * Resolves once the chatbot accepted the request and the reply stream is open;
   * rejects when the chatbot is unavailable. The stream may still fail while iterating.
   */
  send(request: ChatbotRequest): Promise<AsyncIterable<UnsequencedServerEvent>>;
}

export interface TokenService {
  issue(sessionId: string): Promise<string>;
  verify(token: string): Promise<Result<{ sessionId: string }, 'invalid' | 'expired'>>;
}

export interface RateLimiter {
  take(key: string): { allowed: boolean; retryAfterMs: number };
}

export interface SessionRegistry {
  /** Returns undefined when the gateway is at capacity. */
  create(): SessionState | undefined;
  get(sessionId: string): SessionState | undefined;
  touch(sessionId: string): void;
  /** Marks the session as used (stream opened or event accepted): it then gets the full idle TTL. */
  markActive(sessionId: string): void;
}

export interface Logger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

export type Clock = () => number;
export type IdGenerator = () => string;
