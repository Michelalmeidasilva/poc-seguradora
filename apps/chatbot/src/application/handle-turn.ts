import {
  UnsequencedServerEventSchema,
  type ChatbotRequest,
  type UnsequencedServerEvent,
} from '@seguradora/protocol';
import { next, type Input, type ServiceCall, type Step } from '../domain/dialog';
import type { ReplyBody } from '../domain/reply';
import type { AssistanceState } from '../domain/assistance-journey';
import {
  assistanceEntry,
  assistanceStepForAudio,
  assistanceStepForText,
  InMemoryAssistanceStateStore,
  runAssistanceTurn,
  type AssistanceInput,
} from './assistance-turn';
import type { TurnLog, TurnRecord } from '../domain/turn-log';
import { idempotencyKeyFor } from './idempotency';
import type {
  CallContext,
  Clock,
  DialogStore,
  IdGenerator,
  LlmProvider,
  Logger,
  ServicesPort,
  TurnRunner,
  AssistancePort,
} from './ports';

export interface HandleTurnDeps {
  llm: LlmProvider;
  services: ServicesPort;
  dialogs: DialogStore;
  turns: TurnLog;
  newId: IdGenerator;
  now: Clock;
  logger: Logger;
  assistance?: AssistancePort;
  assistanceStates?: InMemoryAssistanceStateStore;
}

const MAX_CALLS_PER_TURN = 5;
const INTERNAL_ERROR_MESSAGE = 'Não foi possível processar sua mensagem. Tente novamente.';

/** The claim occurrence date is the user's (Brazil) date, not the UTC one. */
const SAO_PAULO_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });
const saoPauloDate = (now: number): string => SAO_PAULO_DATE.format(new Date(now));

/** An outgoing event that does not match the protocol (carries the issue paths, never values). */
export class InvalidOutgoingEventError extends Error {
  override readonly name = 'InvalidOutgoingEventError';
  constructor(readonly paths: string[]) {
    super('outgoing event does not match the protocol');
  }
}

/** Never log anything the user typed or received from a service: only the error type. */
const describeError = (error: unknown): { name: string; paths?: string[] } => {
  if (error instanceof InvalidOutgoingEventError) return { name: error.name, paths: error.paths };
  return { name: error instanceof Error ? error.name : 'UnknownError' };
};

/**
 * One turn = one user event. The first call for a (session, `event.id`) pair runs the turn in
 * the background and every call (first or repeated) reads the events from the `TurnRecord`, so
 * the same id in the same session never executes twice and always yields the same events.
 */
export class HandleTurn implements TurnRunner {
  /** Turns executing right now (they keep running even when their client is gone). */
  private readonly running = new Set<Promise<void>>();
  /** A session's stateful turns run in arrival order; unrelated sessions remain concurrent. */
  private readonly sessionTails = new Map<string, Promise<void>>();

  constructor(private readonly d: HandleTurnDeps) {}

  run(request: ChatbotRequest): AsyncGenerator<UnsequencedServerEvent> {
    // Event ids come from the client: scope them by session so sessions never share a turn.
    const { record, created } = this.d.turns.begin(`${request.sessionId}\n${request.event.id}`);
    if (created) {
      const previous = this.sessionTails.get(request.sessionId) ?? Promise.resolve();
      const running: Promise<void> = previous
        .catch(() => undefined)
        .then(() => this.execute(request, record))
        .catch(() => undefined)
        .finally(() => {
          this.running.delete(running);
          if (this.sessionTails.get(request.sessionId) === running)
            this.sessionTails.delete(request.sessionId);
        });
      this.sessionTails.set(request.sessionId, running);
      this.running.add(running);
    }
    return record.stream();
  }

  /**
   * Resolves when every running turn has finished or after `timeoutMs`, whichever comes first.
   * Never rejects. Used on shutdown so a turn whose service call already succeeded can answer.
   */
  async drain(timeoutMs: number): Promise<void> {
    if (this.running.size === 0) return;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    });
    try {
      await Promise.race([Promise.all([...this.running]), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Never rejects: failures become an `error` event. Always finishes the record. */
  private async execute(request: ChatbotRequest, record: TurnRecord): Promise<void> {
    const emit = (body: ReplyBody) => record.push(this.envelope(request, body));
    const log = { sessionId: request.sessionId, correlationId: request.correlationId };
    try {
      const event = request.event;
      if (event.type === 'user.flow_data_exchange') {
        // No Flow uses a data endpoint yet: the exchange is acknowledged with an empty turn
        // (no typing, no dialog input, no reply). Only the shape is logged, never the values.
        const { flowId, screen, action, data } = event.payload;
        this.d.logger.debug(
          { ...log, flowId, screen, action, dataKeys: Object.keys(data).length },
          'flow data exchange ignored',
        );
        return;
      }
      emit({ type: 'status.typing', payload: { state: 'start' } });
      let assistanceState = this.d.assistanceStates?.get(request.sessionId);
      const legacyDialogIsIdle = this.d.dialogs.get(request.sessionId).name === 'idle';
      // Older integrations can omit the assistance adapter. Once the new experience
      // is active, customer text must never escape into legacy insurance screens.
      if (assistanceState && !this.d.assistance) {
        this.d.assistanceStates?.clear(request.sessionId);
        assistanceState = undefined;
      }
      if (
        !assistanceState &&
        legacyDialogIsIdle &&
        this.d.assistance &&
        event.type === 'user.text' &&
        !assistanceStepForText(event.payload.text) &&
        !/^demo flow$/i.test(event.payload.text.trim())
      ) {
        const intent = await this.d.llm.classify(event.payload.text);
        if (['unknown', 'greeting', 'help'].includes(intent.name)) {
          assistanceState = assistanceEntry('ENT-02').state;
        }
      }
      const assistanceInput = assistanceState
        ? this.assistanceInput(request)
        : legacyDialogIsIdle && event.type === 'user.text'
          ? this.assistanceInput(request, assistanceStepForText(event.payload.text))
          : legacyDialogIsIdle &&
              event.type === 'user.voice' &&
              assistanceStepForAudio(event.payload.mediaId)
            ? this.assistanceInput(request)
            : undefined;
      if (assistanceInput && this.d.assistance && this.d.assistanceStates) {
        const initial = assistanceState ?? this.entryState(request, assistanceInput);
        if (initial) {
          const result = await runAssistanceTurn(assistanceInput, {
            port: this.d.assistance,
            state: initial,
            sessionId: request.sessionId,
            context: {
              correlationId: request.correlationId,
              idempotencyKey: idempotencyKeyFor(request.sessionId, request.event.id),
            },
          });
          emit({ type: 'status.typing', payload: { state: 'stop' } });
          if (result.ok) {
            // Persist precisely the domain transition result; initial CPF is never part of it.
            this.d.assistanceStates.set(request.sessionId, result.value.state);
            for (const body of result.value.replies) emit(body);
          } else {
            emit({
              type: 'message.text',
              payload: { text: 'Esta demonstração está indisponível no momento.' },
            });
          }
          return;
        }
      }
      const input = await this.toInput(request);
      if (input) {
        const step = await this.decide(request, input);
        this.d.dialogs.set(request.sessionId, step.state);
        emit({ type: 'status.typing', payload: { state: 'stop' } });
        for (const body of step.replies) emit(body);
      } else {
        emit({ type: 'status.typing', payload: { state: 'stop' } });
      }
    } catch (error) {
      // The error path must not throw either: a failing logger or id generator is swallowed.
      try {
        this.d.logger.error({ ...log, err: describeError(error) }, 'turn failed');
      } catch {
        // nothing left to report to
      }
      try {
        emit({
          type: 'error',
          payload: { code: 'internal_error', message: INTERNAL_ERROR_MESSAGE },
        });
      } catch {
        // the consumer still gets the end of the stream below
      }
    } finally {
      record.finish();
    }
  }

  private assistanceInput(
    request: ChatbotRequest,
    matched?: { id: string },
  ): AssistanceInput | undefined {
    const event = request.event;
    switch (event.type) {
      case 'user.text':
        return { type: 'text', text: event.payload.text };
      case 'user.quick_reply':
        return { type: 'quick_reply', target: event.payload.optionId };
      case 'user.flow_submit':
        return { type: 'flow_submit', flowId: event.payload.flowId, data: event.payload.data };
      case 'user.voice':
        return {
          type: 'voice',
          mediaId: event.payload.mediaId,
          durationMs: event.payload.durationMs,
        };
      default:
        return matched ? { type: 'open', target: matched.id } : undefined;
    }
  }

  private entryState(request: ChatbotRequest, input: AssistanceInput): AssistanceState | undefined {
    if (input.type === 'text') {
      const step = assistanceStepForText(input.text);
      if (!step) return undefined;
      return assistanceEntry(step.id).state;
    }
    if (input.type === 'voice' && assistanceStepForAudio(input.mediaId)) {
      return assistanceEntry(input.mediaId).state;
    }
    return undefined;
  }

  private async toInput(request: ChatbotRequest): Promise<Input | undefined> {
    const event = request.event;
    switch (event.type) {
      case 'user.text':
        return {
          kind: 'text',
          text: event.payload.text,
          intent: await this.d.llm.classify(event.payload.text),
        };
      case 'user.quick_reply':
        return { kind: 'choice', optionId: event.payload.optionId };
      case 'user.flow_submit':
        return { kind: 'flow_submit', flowId: event.payload.flowId, data: event.payload.data };
      case 'user.voice':
        return { kind: 'voice', durationMs: event.payload.durationMs };
      default:
        return undefined;
    }
  }

  /** Runs the dialog until it produces a reply, executing the service calls it asks for. */
  private async decide(
    request: ChatbotRequest,
    input: Input,
  ): Promise<Extract<Step, { kind: 'reply' }>> {
    const ctx: CallContext = {
      correlationId: request.correlationId,
      idempotencyKey: idempotencyKeyFor(request.sessionId, request.event.id),
    };
    const state = this.d.dialogs.get(request.sessionId);
    let step = next(state, input, { today: saoPauloDate(this.d.now()) });
    for (let calls = 0; step.kind === 'call'; calls++) {
      if (calls >= MAX_CALLS_PER_TURN) throw new Error('too many service calls in one turn');
      step = await this.runCall(step.call, ctx);
    }
    return step;
  }

  private async runCall(c: ServiceCall, ctx: CallContext): Promise<Step> {
    const s = this.d.services;
    switch (c.op) {
      case 'listPolicies':
        return c.then(await s.listPolicies(c.cpf, ctx));
      case 'getPolicy':
        return c.then(await s.getPolicy(c.numero, ctx));
      case 'secondCopy':
        return c.then(await s.secondCopy(c.numero, ctx));
      case 'createQuote':
        return c.then(await s.createQuote(c.request, ctx));
      case 'openClaim':
        return c.then(await s.openClaim(c.request, ctx));
      case 'getClaim':
        return c.then(await s.getClaim(c.protocolo, ctx));
    }
  }

  /** Builds the event and checks it against the protocol, so no invalid line reaches the gateway. */
  private envelope(request: ChatbotRequest, body: ReplyBody): UnsequencedServerEvent {
    const event = {
      v: 1,
      id: this.d.newId(),
      sessionId: request.sessionId,
      correlationId: request.correlationId,
      ts: new Date(this.d.now()).toISOString(),
      ...body,
    };
    const checked = UnsequencedServerEventSchema.safeParse(event);
    if (!checked.success) {
      throw new InvalidOutgoingEventError(
        checked.error.issues.slice(0, 5).map((i) => i.path.join('.')),
      );
    }
    return event as UnsequencedServerEvent;
  }
}
