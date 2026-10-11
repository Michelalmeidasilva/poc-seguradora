import type { ChatbotRequest, Result, UnsequencedServerEvent } from '@seguradora/protocol';
import type { DialogState, Intent } from '../domain/dialog';
import type {
  Claim,
  ClaimOpened,
  ClaimRequest,
  Policy,
  PolicySummary,
  Quote,
  QuoteRequest,
  SecondCopy,
  ServiceFailure,
} from '../domain/models';

export interface LlmProvider {
  /** Classifies a user message. Implementations must not throw for ordinary input. */
  classify(text: string): Promise<Intent>;
}

export interface CallContext {
  /** Forwarded as `x-correlation-id` to the internal services. */
  correlationId: string;
  /** Sent as `Idempotency-Key` on POSTs (derived from the session and the user event id). */
  idempotencyKey: string;
}

type Outcome<T> = Promise<Result<T, ServiceFailure>>;

/** What the dialog needs from the internal services (cotação, apólice, sinistro). */
export interface ServicesPort {
  listPolicies(cpf: string, ctx: CallContext): Outcome<PolicySummary[]>;
  getPolicy(numero: string, ctx: CallContext): Outcome<Policy>;
  secondCopy(numero: string, ctx: CallContext): Outcome<SecondCopy>;
  createQuote(request: QuoteRequest, ctx: CallContext): Outcome<Quote>;
  openClaim(request: ClaimRequest, ctx: CallContext): Outcome<ClaimOpened>;
  getClaim(protocolo: string, ctx: CallContext): Outcome<Claim>;
}

export interface DialogStore {
  /** Returns the idle state for an unknown or expired session. */
  get(sessionId: string): DialogState;
  set(sessionId: string, state: DialogState): void;
}

/** What the HTTP layer needs from the use case. */
export interface TurnRunner {
  run(request: ChatbotRequest): AsyncIterable<UnsequencedServerEvent>;
}

export interface Logger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

export type Clock = () => number;
export type IdGenerator = () => string;
