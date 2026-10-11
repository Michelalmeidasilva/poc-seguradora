import type { ChatbotRequest, UnsequencedServerEvent } from '@seguradora/protocol';
import { next, type Input, type ServiceCall, type Step } from '../domain/dialog';
import type { ReplyBody } from '../domain/reply';
import type { TurnLog, TurnRecord } from '../domain/turn-log';
import type {
  CallContext,
  Clock,
  DialogStore,
  IdGenerator,
  LlmProvider,
  Logger,
  ServicesPort,
  TurnRunner,
} from './ports';

export interface HandleTurnDeps {
  llm: LlmProvider;
  services: ServicesPort;
  dialogs: DialogStore;
  turns: TurnLog;
  newId: IdGenerator;
  now: Clock;
  logger: Logger;
}

const MAX_CALLS_PER_TURN = 5;
const INTERNAL_ERROR_MESSAGE = 'Não foi possível processar sua mensagem. Tente novamente.';

/** Never log anything the user typed or received from a service: only the error type. */
const describeError = (error: unknown): { name: string } => ({
  name: error instanceof Error ? error.name : 'UnknownError',
});

/**
 * One turn = one user event. The first call for an `event.id` runs the turn in the background
 * and every call (first or repeated) reads the events from the `TurnRecord`, so the same id
 * never executes twice and always yields the same events.
 */
export class HandleTurn implements TurnRunner {
  constructor(private readonly d: HandleTurnDeps) {}

  run(request: ChatbotRequest): AsyncGenerator<UnsequencedServerEvent> {
    const { record, created } = this.d.turns.begin(request.event.id);
    if (created) void this.execute(request, record);
    return record.stream();
  }

  /** Never rejects: failures become an `error` event. Always finishes the record. */
  private async execute(request: ChatbotRequest, record: TurnRecord): Promise<void> {
    const emit = (body: ReplyBody) => record.push(this.envelope(request, body));
    const log = { sessionId: request.sessionId, correlationId: request.correlationId };
    try {
      if (request.event.type !== 'user.flow_data_exchange') {
        emit({ type: 'status.typing', payload: { state: 'start' } });
        const input = await this.toInput(request);
        if (input) {
          const step = await this.decide(request, input);
          this.d.dialogs.set(request.sessionId, step.state);
          emit({ type: 'status.typing', payload: { state: 'stop' } });
          for (const body of step.replies) emit(body);
        } else {
          emit({ type: 'status.typing', payload: { state: 'stop' } });
        }
      }
    } catch (error) {
      this.d.logger.error({ ...log, err: describeError(error) }, 'turn failed');
      emit({
        type: 'error',
        payload: { code: 'internal_error', message: INTERNAL_ERROR_MESSAGE },
      });
    } finally {
      record.finish();
    }
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
      idempotencyKey: request.event.id,
    };
    const state = this.d.dialogs.get(request.sessionId);
    let step = next(state, input, { today: new Date(this.d.now()).toISOString().slice(0, 10) });
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

  private envelope(request: ChatbotRequest, body: ReplyBody): UnsequencedServerEvent {
    return {
      v: 1,
      id: this.d.newId(),
      sessionId: request.sessionId,
      correlationId: request.correlationId,
      ts: new Date(this.d.now()).toISOString(),
      ...body,
    } as UnsequencedServerEvent;
  }
}
