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
import type {
  AddDependentCommand,
  AssistanceBenefit,
  AssistanceBilling,
  AssistanceAddressCommand,
  AssistanceDocument,
  AssistanceDependent,
  AssistancePreferences,
  AssistanceRequest,
  AssistanceSessionSnapshot,
  FuneralAssistanceCommand,
  ChangeModalityCommand,
  CreateAssistanceRequestCommand,
  RegularizeBillingCommand,
  RemoveDependentCommand,
  UpdateDependentCommand,
  UpdatePreferencesCommand,
} from './assistance-service';

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

/** Expected outcomes from the demonstrative assistance adapter. */
export type AssistanceFailure = 'not_found' | 'conflict' | 'invalid' | 'unavailable';

type AssistanceOutcome<T> = Promise<Result<T, AssistanceFailure>>;

/** Typed read/write contract for assistance journeys, separate from quote/policy/claim services. */
export interface AssistancePort {
  getSessionSnapshot(
    sessionId: string,
    ctx: CallContext,
  ): AssistanceOutcome<AssistanceSessionSnapshot>;
  listBenefits(sessionId: string, ctx: CallContext): AssistanceOutcome<AssistanceBenefit[]>;
  listDocuments(sessionId: string, ctx: CallContext): AssistanceOutcome<AssistanceDocument[]>;
  listDependents(sessionId: string, ctx: CallContext): AssistanceOutcome<AssistanceDependent[]>;
  addDependent(
    sessionId: string,
    command: AddDependentCommand,
    ctx: CallContext,
  ): AssistanceOutcome<AssistanceDependent>;
  updateDependent(
    sessionId: string,
    command: UpdateDependentCommand,
    ctx: CallContext,
  ): AssistanceOutcome<AssistanceDependent>;
  removeDependent(
    sessionId: string,
    command: RemoveDependentCommand,
    ctx: CallContext,
  ): AssistanceOutcome<void>;
  changeModality(
    sessionId: string,
    command: ChangeModalityCommand,
    ctx: CallContext,
  ): AssistanceOutcome<void>;
  renewAssistance(
    sessionId: string,
    command: { confirmed: true },
    ctx: CallContext,
  ): AssistanceOutcome<AssistanceRequest>;
  updateAddress(
    sessionId: string,
    command: AssistanceAddressCommand,
    ctx: CallContext,
  ): AssistanceOutcome<AssistanceRequest>;
  requestFuneralAssistance(
    sessionId: string,
    command: FuneralAssistanceCommand,
    ctx: CallContext,
  ): AssistanceOutcome<AssistanceRequest>;
  cancelAssistance(
    sessionId: string,
    command: { confirmed: true; reason: string },
    ctx: CallContext,
  ): AssistanceOutcome<AssistanceRequest>;
  getBilling(sessionId: string, ctx: CallContext): AssistanceOutcome<AssistanceBilling>;
  regularizeBilling(
    sessionId: string,
    command: RegularizeBillingCommand,
    ctx: CallContext,
  ): AssistanceOutcome<AssistanceBilling>;
  getPreferences(sessionId: string, ctx: CallContext): AssistanceOutcome<AssistancePreferences>;
  updatePreferences(
    sessionId: string,
    command: UpdatePreferencesCommand,
    ctx: CallContext,
  ): AssistanceOutcome<AssistancePreferences>;
  listRequests(sessionId: string, ctx: CallContext): AssistanceOutcome<AssistanceRequest[]>;
  createRequest(
    sessionId: string,
    command: CreateAssistanceRequestCommand,
    ctx: CallContext,
  ): AssistanceOutcome<AssistanceRequest>;
  getRequest(
    sessionId: string,
    requestId: string,
    ctx: CallContext,
  ): AssistanceOutcome<AssistanceRequest>;
}

export interface DialogStore {
  /** Returns the idle state for an unknown or expired session. */
  get(sessionId: string): DialogState;
  set(sessionId: string, state: DialogState): void;
}

/** What the HTTP layer needs from the use case. */
export interface TurnRunner {
  run(request: ChatbotRequest): AsyncIterable<UnsequencedServerEvent>;
  /** Waits (at most `timeoutMs`) for the running turns to finish. Never rejects. */
  drain?(timeoutMs: number): Promise<void>;
}

export interface Logger {
  debug(obj: object, msg: string): void;
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

export type Clock = () => number;
export type IdGenerator = () => string;
