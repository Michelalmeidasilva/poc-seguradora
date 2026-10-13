import { err, ok, type Result } from '@seguradora/protocol';
import { z } from 'zod';
import type { CallContext, Clock, AssistanceFailure, AssistancePort } from '../application/ports';
import type {
  AddDependentCommand,
  AssistanceBenefit,
  AssistanceBilling,
  AssistanceDocument,
  AssistanceDependent,
  AssistancePreferences,
  AssistanceRequest,
  AssistanceRequestKind,
  AssistanceSessionSnapshot,
  ChangeModalityCommand,
  CreateAssistanceRequestCommand,
  RegularizeBillingCommand,
  RemoveDependentCommand,
  UpdateDependentCommand,
  UpdatePreferencesCommand,
} from '../application/assistance-service';

export interface MockAssistanceOptions {
  capacity: number;
  ttlMs: number;
  /** Maximum replay records retained per active session (FIFO). */
  idempotencyCapacity?: number;
  now?: Clock;
  /** Deterministic adapter failure switch, intended for demo scenarios and tests. */
  unavailable?: readonly AssistanceOperation[];
}

export type AssistanceOperation =
  | 'addDependent'
  | 'updateDependent'
  | 'removeDependent'
  | 'changeModality'
  | 'renewAssistance'
  | 'cancelAssistance'
  | 'regularizeBilling'
  | 'updatePreferences'
  | 'createRequest';

interface SessionState {
  contract: AssistanceSessionSnapshot['contract'];
  dependents: AssistanceDependent[];
  benefits: AssistanceBenefit[];
  documents: AssistanceDocument[];
  billing: AssistanceBilling;
  preferences: AssistancePreferences;
  requests: AssistanceRequest[];
  dependentSequence: number;
  requestSequence: number;
}

interface SessionEntry {
  state: SessionState;
  updatedAt: number;
  idempotency: Map<
    string,
    { operation: AssistanceOperation; result: Result<unknown, AssistanceFailure> }
  >;
}

const dependentInput = z
  .object({
    name: z.string().trim().min(1).max(100),
    cpf: z.string().regex(/^\d{11}$/),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    relationship: z.string().trim().min(1).max(40),
    phone: z.string().trim().min(1).max(30).optional(),
    biologicalSex: z.enum(['female', 'male', 'not_informed']).optional(),
  })
  .strict();

const preferencesSchema = z
  .object({
    contactChannel: z.enum(['whatsapp', 'email']),
    email: z.string().email().max(254),
    paperless: z.boolean(),
  })
  .strict();

const fail = (reason: AssistanceFailure) => err<AssistanceFailure>(reason);

const baseFixture = (): SessionState => ({
  contract: { status: 'active', modality: 'familiar', since: '2026-10-10' },
  dependents: [],
  benefits: [
    {
      id: 'BEN-TELEMEDICINA',
      name: 'Telemedicina',
      service: 'telemedicine',
      availability: 'illustrative',
    },
    {
      id: 'BEN-FUNERAL',
      name: 'Assistência Funeral',
      service: 'funeral',
      availability: 'illustrative',
    },
    {
      id: 'BEN-FARMACIA',
      name: 'Assistência Farmácia',
      service: 'pharmacy',
      availability: 'illustrative',
    },
  ],
  documents: [
    { id: 'DOC-ADESAO-DEMO', title: 'Termo demonstrativo de adesão', status: 'available' },
    { id: 'DOC-CONDICOES-DEMO', title: 'Condições demonstrativas do serviço', status: 'available' },
    { id: 'DOC-COMPROVANTE-DEMO', title: 'Comprovante demonstrativo', status: 'generating' },
  ],
  billing: {
    status: 'demonstrative',
    reference: 'REF-DEMO-001',
    message: 'Informação demonstrativa; nenhuma cobrança foi realizada.',
  },
  preferences: { contactChannel: 'whatsapp', email: 'cliente@example.test', paperless: true },
  requests: [],
  dependentSequence: 0,
  requestSequence: 0,
});

const sessionSnapshot = (state: SessionState): AssistanceSessionSnapshot => ({
  demonstrative: true,
  contract: state.contract,
  dependents: state.dependents,
  benefits: state.benefits,
  documents: state.documents,
  billing: state.billing,
  preferences: state.preferences,
  requests: state.requests,
});

/** Volatile, deterministic assistance data isolated by gateway session id. */
export class MockAssistance implements AssistancePort {
  private readonly sessions = new Map<string, SessionEntry>();
  private readonly now: Clock;
  private readonly unavailable: Set<AssistanceOperation>;

  constructor(private readonly options: MockAssistanceOptions) {
    if (!Number.isInteger(options.capacity) || options.capacity < 1)
      throw new RangeError('capacity must be an integer >= 1');
    if (!Number.isFinite(options.ttlMs) || options.ttlMs < 1)
      throw new RangeError('ttlMs must be positive');
    if (
      options.idempotencyCapacity !== undefined &&
      (!Number.isInteger(options.idempotencyCapacity) || options.idempotencyCapacity < 1)
    )
      throw new RangeError('idempotencyCapacity must be an integer >= 1');
    this.now = options.now ?? Date.now;
    this.unavailable = new Set(options.unavailable ?? []);
  }

  async getSessionSnapshot(sessionId: string, ctx: CallContext) {
    if (!sessionId.trim() || !this.validContext(ctx)) return fail('invalid');
    const entry = this.session(sessionId);
    return ok(structuredClone(sessionSnapshot(entry.state)));
  }

  async listBenefits(sessionId: string, ctx: CallContext) {
    if (!sessionId.trim() || !this.validContext(ctx)) return fail('invalid');
    return ok(structuredClone(this.session(sessionId).state.benefits));
  }

  async listDocuments(sessionId: string, ctx: CallContext) {
    if (!sessionId.trim() || !this.validContext(ctx)) return fail('invalid');
    return ok(structuredClone(this.session(sessionId).state.documents));
  }

  async listDependents(sessionId: string, ctx: CallContext) {
    if (!sessionId.trim() || !this.validContext(ctx)) return fail('invalid');
    return ok(structuredClone(this.session(sessionId).state.dependents));
  }

  async addDependent(sessionId: string, command: AddDependentCommand, ctx: CallContext) {
    const parsed = dependentInput.safeParse(command.dependent);
    if (!command.confirmed || !parsed.success) return fail('invalid');
    return this.mutate(sessionId, ctx, 'addDependent', (state) => {
      const dependent = { ...parsed.data, id: `DEP-DEMO-${++state.dependentSequence}` };
      state.dependents.push(dependent);
      return ok(structuredClone(dependent));
    });
  }

  async updateDependent(sessionId: string, command: UpdateDependentCommand, ctx: CallContext) {
    if (!command.confirmed || !command.dependentId || !Object.keys(command.changes).length)
      return fail('invalid');
    const parsed = dependentInput.partial().strict().safeParse(command.changes);
    if (!parsed.success) return fail('invalid');
    return this.mutate(sessionId, ctx, 'updateDependent', (state) => {
      const dependent = state.dependents.find((item) => item.id === command.dependentId);
      if (!dependent) return fail('not_found');
      Object.assign(dependent, parsed.data);
      return ok(structuredClone(dependent));
    });
  }

  async removeDependent(sessionId: string, command: RemoveDependentCommand, ctx: CallContext) {
    if (!command.confirmed || !command.dependentId) return fail('invalid');
    return this.mutate(sessionId, ctx, 'removeDependent', (state) => {
      const index = state.dependents.findIndex((item) => item.id === command.dependentId);
      if (index < 0) return fail('not_found');
      state.dependents.splice(index, 1);
      return ok(undefined);
    });
  }

  async changeModality(sessionId: string, command: ChangeModalityCommand, ctx: CallContext) {
    if (!command.confirmed || !['individual', 'familiar'].includes(command.modality))
      return fail('invalid');
    return this.mutate(sessionId, ctx, 'changeModality', (state) => {
      if (state.contract.status !== 'active') return fail('conflict');
      state.contract.modality = command.modality;
      return ok(undefined);
    });
  }

  async renewAssistance(sessionId: string, command: { confirmed: true }, ctx: CallContext) {
    if (!command.confirmed) return fail('invalid');
    return this.mutate(sessionId, ctx, 'renewAssistance', (state) => {
      return ok(structuredClone(this.addRequest(state, 'renewal', 'Renovação demonstrativa registrada.')));
    });
  }

  async cancelAssistance(
    sessionId: string,
    command: { confirmed: true; reason: string },
    ctx: CallContext,
  ) {
    if (!command.confirmed || !command.reason.trim()) return fail('invalid');
    return this.mutate(sessionId, ctx, 'cancelAssistance', (state) => {
      if (state.contract.status !== 'active') return fail('conflict');
      const request = this.addRequest(
        state,
        'cancellation',
        'Cancelamento demonstrativo confirmado.',
      );
      state.contract.status = 'cancelled';
      return ok(structuredClone(request));
    });
  }

  async getBilling(sessionId: string, ctx: CallContext) {
    if (!sessionId.trim() || !this.validContext(ctx)) return fail('invalid');
    return ok(structuredClone(this.session(sessionId).state.billing));
  }

  async regularizeBilling(sessionId: string, command: RegularizeBillingCommand, ctx: CallContext) {
    if (!command.confirmed || !command.reference.trim()) return fail('invalid');
    return this.mutate(sessionId, ctx, 'regularizeBilling', (state) => {
      state.billing = {
        status: 'demonstrative',
        reference: `REG-DEMO-${state.requestSequence + 1}`,
        message: 'Regularização demonstrativa registrada; nenhum pagamento foi realizado.',
      };
      this.addRequest(state, 'billing_regularization', 'Regularização demonstrativa registrada.');
      return ok(structuredClone(state.billing));
    });
  }

  async getPreferences(sessionId: string, ctx: CallContext) {
    if (!sessionId.trim() || !this.validContext(ctx)) return fail('invalid');
    return ok(structuredClone(this.session(sessionId).state.preferences));
  }

  async updatePreferences(sessionId: string, command: UpdatePreferencesCommand, ctx: CallContext) {
    const parsed = preferencesSchema.safeParse(command.preferences);
    if (!command.confirmed || !parsed.success) return fail('invalid');
    return this.mutate(sessionId, ctx, 'updatePreferences', (state) => {
      state.preferences = parsed.data;
      return ok(structuredClone(state.preferences));
    });
  }

  async listRequests(sessionId: string, ctx: CallContext) {
    if (!sessionId.trim() || !this.validContext(ctx)) return fail('invalid');
    return ok(structuredClone(this.session(sessionId).state.requests));
  }

  async createRequest(
    sessionId: string,
    command: CreateAssistanceRequestCommand,
    ctx: CallContext,
  ) {
    if (!command.confirmed || !command.message.trim()) return fail('invalid');
    const kinds: AssistanceRequestKind[] = [
      'modality_change',
      'renewal',
      'cancellation',
      'billing_regularization',
      'document',
      'human_handoff',
    ];
    if (!kinds.includes(command.kind)) return fail('invalid');
    return this.mutate(sessionId, ctx, 'createRequest', (state) =>
      ok(structuredClone(this.addRequest(state, command.kind, command.message))),
    );
  }

  async getRequest(sessionId: string, requestId: string, ctx: CallContext) {
    if (!sessionId.trim() || !requestId.trim() || !this.validContext(ctx)) return fail('invalid');
    const request = this.session(sessionId).state.requests.find((item) => item.id === requestId);
    return request ? ok(structuredClone(request)) : fail('not_found');
  }

  private session(sessionId: string): SessionEntry {
    const now = this.now();
    let entry = this.sessions.get(sessionId);
    if (entry && now - entry.updatedAt >= this.options.ttlMs) {
      this.sessions.delete(sessionId);
      entry = undefined;
    }
    if (!entry) {
      while (this.sessions.size >= this.options.capacity) {
        const oldest = this.sessions.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        this.sessions.delete(oldest);
      }
      entry = { state: baseFixture(), updatedAt: now, idempotency: new Map() };
    } else {
      this.sessions.delete(sessionId);
      entry.updatedAt = now;
    }
    this.sessions.set(sessionId, entry);
    return entry;
  }

  private mutate<T>(
    sessionId: string,
    ctx: CallContext,
    operation: AssistanceOperation,
    apply: (state: SessionState) => Result<T, AssistanceFailure>,
  ): Result<T, AssistanceFailure> {
    if (!sessionId.trim() || !this.validContext(ctx)) return fail('invalid');
    const entry = this.session(sessionId);
    const replay = entry.idempotency.get(ctx.idempotencyKey);
    if (replay) {
      if (replay.operation !== operation) return fail('conflict');
      return structuredClone(replay.result) as Result<T, AssistanceFailure>;
    }
    const result: Result<T, AssistanceFailure> = this.unavailable.has(operation)
      ? fail('unavailable')
      : apply(entry.state);
    entry.idempotency.set(ctx.idempotencyKey, { operation, result: structuredClone(result) });
    const maxEntries = this.options.idempotencyCapacity ?? 256;
    while (entry.idempotency.size > maxEntries) {
      const oldest = entry.idempotency.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      entry.idempotency.delete(oldest);
    }
    return result;
  }

  private validContext(ctx: CallContext): boolean {
    return Boolean(ctx.correlationId.trim() && ctx.idempotencyKey.trim());
  }

  private addRequest(
    state: SessionState,
    kind: AssistanceRequestKind,
    message: string,
  ): AssistanceRequest {
    const request = {
      id: `REQ-DEMO-${++state.requestSequence}`,
      kind,
      status: 'received' as const,
      message,
    };
    state.requests.push(request);
    return request;
  }
}
