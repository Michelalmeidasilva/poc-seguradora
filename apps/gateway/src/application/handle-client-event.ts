import type {
  ChatbotRequest,
  ClientEvent,
  ErrorCode,
  UnsequencedServerEvent,
} from '@seguradora/protocol';
import type { SessionState } from '../domain/session-state';
import { ChatbotProtocolError } from './errors';
import type { ChatbotPort, Clock, IdGenerator, Logger, RateLimiter } from './ports';

export type HandleResult =
  | { status: 'accepted'; completion: Promise<void> }
  | { status: 'duplicate' }
  | { status: 'rate_limited'; retryAfterMs: number };

export interface HandleClientEventDeps {
  chatbot: ChatbotPort;
  sessionLimiter: RateLimiter;
  ipLimiter: RateLimiter;
  /** Max turns of one session running + waiting; beyond it events are rate limited. */
  maxQueuedTurns: number;
  newId: IdGenerator;
  now: Clock;
  logger: Logger;
}

const UNAVAILABLE_MESSAGE = 'O atendimento está indisponível no momento. Tente novamente.';
/** After delivery the id stays registered: do not promise a retry of the same message. */
const INTERRUPTED_MESSAGE =
  'A resposta foi interrompida. Envie sua mensagem novamente como uma nova mensagem.';
const QUEUE_FULL_RETRY_MS = 1000;

const describeError = (error: unknown): { name: string; message: string } =>
  error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: 'UnknownError', message: String(error) };

/** Accepts one client event: limits, idempotency, forwarding to the chatbot, publishing replies. */
export class HandleClientEvent {
  constructor(private readonly d: HandleClientEventDeps) {}

  handle(session: SessionState, event: ClientEvent, clientIp: string): HandleResult {
    const ip = this.d.ipLimiter.take(`ip:${clientIp}`);
    const own = this.d.sessionLimiter.take(`session:${session.sessionId}`);
    if (!ip.allowed || !own.allowed) {
      return {
        status: 'rate_limited',
        retryAfterMs: Math.max(ip.retryAfterMs, own.retryAfterMs),
      };
    }

    // Idempotent and cheap: they must not occupy (or evict) real message ids.
    if (event.type === 'user.ack') {
      session.acknowledge(event.payload.lastSeq);
      return { status: 'accepted', completion: Promise.resolve() };
    }
    if (event.type === 'user.typing') {
      return { status: 'accepted', completion: Promise.resolve() };
    }

    if (session.registerEvent(event.id) === 'duplicate') return { status: 'duplicate' };

    // Turns of one session run one at a time, in arrival order.
    let finish!: () => void;
    const completion = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const queued = session.enqueueTurn(
      () => this.forward(session, event).finally(finish),
      this.d.maxQueuedTurns,
    );
    if (queued === 'full') {
      session.forgetEvent(event.id);
      return { status: 'rate_limited', retryAfterMs: QUEUE_FULL_RETRY_MS };
    }
    return { status: 'accepted', completion };
  }

  private async forward(session: SessionState, event: ClientEvent): Promise<void> {
    const log = {
      sessionId: session.sessionId,
      correlationId: event.correlationId,
      messageId: event.id,
    };
    try {
      const request: ChatbotRequest = {
        v: 1,
        sessionId: session.sessionId,
        correlationId: event.correlationId,
        event,
      };

      let replies: AsyncIterable<UnsequencedServerEvent>;
      try {
        replies = await this.d.chatbot.send(request);
      } catch (error) {
        // Nothing reached the chatbot: allow the client to resend the same id.
        session.forgetEvent(event.id);
        this.d.logger.warn({ ...log, err: describeError(error) }, 'chatbot unavailable');
        this.publishError(session, event, 'upstream_unavailable', UNAVAILABLE_MESSAGE, true);
        return;
      }

      session.publish({
        ...this.base(session, event.correlationId),
        type: 'status.delivered',
        payload: { messageId: event.id },
      });

      try {
        for await (const reply of replies) {
          if (reply.sessionId !== session.sessionId) {
            this.d.logger.warn(
              { ...log, replySessionId: reply.sessionId },
              'dropped foreign reply',
            );
            continue;
          }
          session.publish(reply);
        }
      } catch (error) {
        this.d.logger.warn({ ...log, err: describeError(error) }, 'chatbot stream failed');
        const code =
          error instanceof ChatbotProtocolError ? 'internal_error' : 'upstream_unavailable';
        this.publishError(session, event, code, INTERRUPTED_MESSAGE, false);
      }
    } catch (error) {
      // Last resort so a completion promise never rejects unobserved.
      this.d.logger.error(
        { ...log, err: describeError(error) },
        'unexpected failure handling event',
      );
    }
  }

  private base(session: SessionState, correlationId: string) {
    return {
      v: 1 as const,
      id: this.d.newId(),
      sessionId: session.sessionId,
      correlationId,
      ts: new Date(this.d.now()).toISOString(),
    };
  }

  private publishError(
    session: SessionState,
    event: ClientEvent,
    code: ErrorCode,
    message: string,
    retryable: boolean,
  ): void {
    session.publish({
      ...this.base(session, event.correlationId),
      type: 'error',
      payload: { code, message, ...(retryable ? { messageId: event.id } : {}) },
    });
  }
}
