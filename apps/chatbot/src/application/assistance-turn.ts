import { err, ok, type Result } from '@seguradora/protocol';
import { z } from 'zod';
import { assistanceCatalog, type AssistanceStep } from '../domain/assistance-catalog';
import { nextAssistanceState, type AssistanceState } from '../domain/assistance-journey';
import { assistanceFlows } from '../domain/flows';
import { parseDependentStatement } from '../domain/dependent-statement';
import type { AssistanceDocumentScreen } from './assistance-service';
import type { ReplyBody } from '../domain/reply';
import type { AssistancePort, CallContext, AssistanceFailure } from './ports';

export type AssistanceInput =
  | { type: 'text'; text: string }
  | { type: 'quick_reply'; target: string }
  | { type: 'flow_submit'; flowId: string; data: unknown }
  | { type: 'flow_data_exchange' }
  | { type: 'voice'; mediaId: string; durationMs: number }
  | { type: 'open'; target: string }
  | { type: 'cpf_submit'; cpf: string };

export interface AssistanceTurnResult {
  state: AssistanceState;
  replies: ReplyBody[];
}

export interface AssistanceTurnDeps {
  port: AssistancePort;
  state: AssistanceState;
  sessionId: string;
  context: CallContext;
}

const preserveReply = (state: AssistanceState, text: string): AssistanceTurnResult => ({
  state,
  replies: [{ type: 'message.text', payload: { text } } as ReplyBody],
});

const recordOf = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;

const stringFields = (value: unknown): Record<string, string> | undefined => {
  const record = recordOf(value);
  if (!record || Object.keys(record).length > 20) return undefined;
  const pairs = Object.entries(record);
  if (pairs.some(([, item]) => (typeof item !== 'string' && typeof item !== 'boolean') || (typeof item === 'string' && item.length > 500))) return undefined;
  return Object.fromEntries(pairs.map(([key, item]) => [key, String(item)]));
};

function validateFlowData(step: AssistanceStep, input: Record<string, unknown>): Record<string, unknown> | undefined {
  const flow = recordOf(step.flow);
  const fields = Array.isArray(flow?.fields) ? flow.fields.map(recordOf).filter((item) => item !== undefined) : [];
  const choices = Array.isArray(flow?.choices) ? flow.choices.map(recordOf).filter((item) => item !== undefined) : [];
  if (fields.length) {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const field of fields) {
      if (typeof field!.name !== 'string') return undefined;
      const name = field!.name;
      const options = field!.choices;
      let schema: z.ZodTypeAny = field!.type === 'checkbox'
        ? z.preprocess((value) => value === 'true' ? true : value === 'false' ? false : value, z.boolean())
        : z.string().max(500);
      if (Array.isArray(options) && options.length > 0 && options.every((option) => typeof option === 'string')) {
        const allowed = options.filter((option) => option !== 'Selecione') as string[];
        if (allowed.length === 0) return undefined;
        schema = z.enum(allowed as [string, ...string[]]);
      }
      if (field!.required === true && field!.type !== 'checkbox' && !Array.isArray(options)) schema = z.string().min(1).max(500);
      shape[name] = field!.required === true ? schema : schema.optional();
    }
    const parsed = z.object(shape).strict().safeParse(input);
    return parsed.success ? parsed.data : undefined;
  }
  if (choices.length) {
    const targets = choices.map((choice) => choice!.target);
    if (!targets.length || targets.some((target) => typeof target !== 'string')) return undefined;
    const index = z.object({ choice: z.enum(choices.map((_, i) => String(i)) as [string, ...string[]]) }).strict().safeParse(input);
    if (index.success) return { target: targets[Number(index.data.choice)] };
    const legacy = z.object({ target: z.enum(targets as [string, ...string[]]) }).strict().safeParse(input);
    return legacy.success ? legacy.data : undefined;
  }
  if (typeof flow?.correction === 'string' && input.correction === true && Object.keys(input).length === 1) {
    return { correction: true };
  }
  if (flow?.consent !== undefined) {
    const parsed = z.object({ consent: z.literal(true) }).strict().safeParse(input);
    return parsed.success ? parsed.data : undefined;
  }
  return z.object({}).strict().safeParse(input).success ? input : undefined;
}

const textReply = (step: AssistanceStep): ReplyBody[] => {
  const replies: ReplyBody[] = [];
  if (step.mode === 'document') return replies;
  if (step.mode === 'chat' || step.mode === 'audio') {
    replies.push({ type: 'message.text', payload: { text: step.bot } } as ReplyBody);
  } else {
    replies.push({
      type: 'message.flow',
      payload: {
        flowId: step.id,
        body: step.bot,
        ctaLabel: (recordOf(step.flow)?.submit as string | undefined) ?? 'Continuar',
        flowJson: assistanceFlows[step.id] ?? { title: step.title },
      },
    } as ReplyBody);
  }
  if (step.actions.length) {
    replies.push({
      type: 'message.quick_replies',
      payload: {
        text: 'Escolha uma opção para continuar.',
        options: step.actions.map(({ label, target }) => ({ id: target, title: label })),
      },
    } as ReplyBody);
  }
  return replies;
};

const failureText: Record<AssistanceFailure, string> = {
  not_found: 'Não encontrei esse dado demonstrativo. Confira a opção e tente novamente.',
  conflict: 'Não foi possível concluir esta etapa demonstrativa. Confira os dados e tente novamente.',
  invalid: 'Não consegui validar os dados enviados. Confira o formulário e tente novamente.',
  unavailable: 'Esta demonstração está indisponível no momento. Tente novamente mais tarde.',
};

const documentIds = new Set<AssistanceDocumentScreen>(['CON-07', 'UTI-09', 'CAN-08']);
const isDocumentScreen = (screenId: string): screenId is AssistanceDocumentScreen => {
  for (const documentId of documentIds) if (documentId === screenId) return true;
  return false;
};
const audioStepsById: ReadonlyMap<string, AssistanceStep> = new Map(
  assistanceCatalog.steps.filter((step) => step.mode === 'audio').map((step) => [step.id, step]),
);

function requestTarget(step: AssistanceStep): string | undefined {
  const flow = recordOf(step.flow);
  if (typeof flow?.target === 'string') return flow.target;
  const target = step.destinations.find((id) => !id.startsWith('LEG-'));
  return target;
}

async function confirmedMutation(
  step: AssistanceStep,
  data: Record<string, unknown>,
  deps: AssistanceTurnDeps,
): Promise<Result<void, AssistanceFailure>> {
  const { port, sessionId, context } = deps;
  // A validated submission of the current review Flow is itself the explicit confirmation.
  const field = (...names: string[]) => {
    for (const name of names) if (typeof data[name] === 'string') return data[name] as string;
    return '';
  };
  switch (step.id) {
    case 'DEP-06':
    case 'DEP-17': {
      const cpf = field('cpf', 'document').replace(/\D/g, '');
      const name = field('name', 'nome');
      const birthDate = field('birthDate', 'birth', 'nascimento');
      const relationship = field('relationship', 'parentesco');
      const phone = field('phone', 'celular');
      if (!/^\d{11}$/.test(cpf) || !name || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !relationship || !phone) return err('invalid');
      const rawSex = field('biologicalSex');
      const biologicalSex = rawSex === 'female' || rawSex === 'Feminino'
        ? 'female'
        : rawSex === 'male' || rawSex === 'Masculino'
          ? 'male'
          : rawSex === 'not_informed' || rawSex === 'Prefiro não informar'
            ? 'not_informed' : undefined;
      if (!biologicalSex) return err('invalid');
      const result = await port.addDependent(sessionId, {
        confirmed: true,
        dependent: {
          name, cpf,
          birthDate,
          relationship,
          phone,
          biologicalSex,
        },
      }, context);
      return result.ok ? ok(undefined) : result;
    }
    case 'DEP-21': {
      const id = field('dependentId');
      if (!id) return err('invalid');
      const changes = recordOf(data.changes) ?? Object.fromEntries(
        ['name', 'cpf', 'birthDate', 'birth', 'document', 'relationship', 'phone', 'biologicalSex']
          .filter((key) => typeof data[key] === 'string')
          .map((key) => [key, data[key]]),
      );
      if (!changes) return err('invalid');
      const result = await port.updateDependent(sessionId, { confirmed: true, dependentId: id, changes }, context);
      return result.ok ? ok(undefined) : result;
    }
    case 'EXC-03': {
      const id = field('dependentId');
      if (!id) return err('invalid');
      return port.removeDependent(sessionId, { confirmed: true, dependentId: id }, context);
    }
    case 'PLA-06': {
      const modality = data.modality;
      if (modality !== 'individual' && modality !== 'familiar') return err('invalid');
      return port.changeModality(sessionId, { confirmed: true, modality }, context);
    }
    case 'CAN-05': {
      const result = await port.cancelAssistance(sessionId, { confirmed: true, reason: field('reason', 'motivo') || 'solicitado' }, context);
      return result.ok ? ok(undefined) : result;
    }
    case 'REN-03': {
      const result = await port.renewAssistance(sessionId, { confirmed: true }, context);
      return result.ok ? ok(undefined) : result;
    }
    case 'COB-05': {
      const reference = field('reference') || 'REF-DEMO-001';
      const result = await port.regularizeBilling(sessionId, { confirmed: true, reference }, context);
      return result.ok ? ok(undefined) : result;
    }
    case 'CAD-03': {
      const postal = field('postal');
      const address = field('address');
      const city = field('city');
      if (!postal || !address || !city) return err('invalid');
      return port.updateAddress(sessionId, { confirmed: true, postal, address, city }, context).then((result) =>
        result.ok ? ok(undefined) : result,
      );
    }
    case 'FUN-06': {
      const city = field('funeralCity');
      const state = field('funeralState');
      if (!city || !state) return err('invalid');
      return port.requestFuneralAssistance(sessionId, { confirmed: true, city, state }, context).then((result) =>
        result.ok ? ok(undefined) : result,
      );
    }
    case 'PRE-02': {
      if (typeof data.optionalDocs !== 'boolean' || typeof data.optionalBenefits !== 'boolean') return err('invalid');
      const current = await port.getPreferences(sessionId, context);
      if (!current.ok) return current;
      const updated = await port.updatePreferences(sessionId, {
        confirmed: true,
        preferences: { ...current.value, optionalDocs: data.optionalDocs, optionalBenefits: data.optionalBenefits },
      }, context);
      return updated.ok ? ok(undefined) : updated;
    }
    default:
      return ok(undefined);
  }
}

function targetForText(text: string): AssistanceStep | undefined {
  const normalized = text.trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
  const step = assistanceCatalog.steps.find((candidate) =>
    candidate.user.trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ') === normalized,
  );
  // The bare greeting belongs to the legacy intent router; it must not start a second menu.
  return step?.id === 'ENT-02' ? undefined : step;
}

export async function runAssistanceTurn(
  input: AssistanceInput,
  deps: AssistanceTurnDeps,
): Promise<Result<AssistanceTurnResult, AssistanceFailure>> {
  const { state, port, sessionId, context } = deps;
  if (input.type === 'flow_data_exchange') return ok({ state, replies: [] });
  const currentStep = assistanceCatalog.byId[state.screenId];
  if (
    input.type !== 'cpf_submit' &&
    state.journeyId !== 'IDE' &&
    currentStep?.requiresAuth &&
    !state.gateApproved
  ) {
    const gate = nextAssistanceState(state, { type: 'open', target: state.screenId });
    return ok({
      state: { ...gate.state, pendingStep: state.screenId },
      replies: textReply(gate.step),
    });
  }
  if (input.type === 'quick_reply' && ['HUM-05', 'HUM-06'].includes(state.screenId) && input.target === 'HUM-08') {
    const screen = assistanceCatalog.byId[state.screenId]!;
    if (!screen.actions.some((action) => action.target === input.target && /solicitar retorno|registrar retorno/i.test(action.label))) {
      return ok(preserveReply(state, 'Esta opção não corresponde à etapa atual.'));
    }
    const created = await port.createRequest(sessionId, {
      confirmed: true,
      kind: 'human_handoff',
      message: 'Pedido demonstrativo de retorno solicitado pela pessoa',
    }, context);
    if (!created.ok) return ok(preserveReply(state, failureText[created.error]));
  }
  let transitionInput: Parameters<typeof nextAssistanceState>[1] | undefined;
  let submitted: Record<string, unknown> | undefined;

  switch (input.type) {
    case 'open':
      transitionInput = { type: 'open', target: input.target };
      break;
    case 'quick_reply':
      transitionInput = { type: 'quick_reply', target: input.target, offeredFrom: state.screenId };
      break;
    case 'cpf_submit':
      transitionInput = { type: 'cpf_submit', cpf: input.cpf };
      break;
    case 'text': {
      if (state.screenId === 'IDE-08') {
        const cpf = input.text.match(/\b(?:\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})\b/)?.[0] ?? '';
        transitionInput = { type: 'cpf_submit', cpf };
      } else if (state.screenId === 'DEP-33' || state.screenId === 'DEP-04') {
        transitionInput = { type: 'open', target: state.screenId };
      } else {
        const step = targetForText(input.text);
        if (!step) return ok(preserveReply(state, 'Não entendi essa opção. Escolha uma das opções disponíveis.'));
        transitionInput = { type: 'open', target: step.id };
      }
      break;
    }
    case 'voice':
      {
        const fixture = audioStepsById.get(input.mediaId);
        if (!fixture) return ok(preserveReply(state, 'Use uma das mídias de áudio demonstrativas disponíveis.'));
        transitionInput = { type: 'open', target: fixture.id };
      }
      break;
    case 'flow_submit': {
      if (input.flowId !== state.screenId) return ok(preserveReply(state, 'Este formulário não corresponde à etapa atual.'));
      submitted = recordOf(input.data);
      if (!submitted) return ok(preserveReply(state, 'O formulário não foi enviado corretamente. Tente novamente.'));
      const currentStep = assistanceCatalog.byId[state.screenId];
      if (!currentStep) return ok(preserveReply(state, 'Esta etapa demonstrativa não está disponível.'));
      const validated = validateFlowData(currentStep, submitted);
      if (!validated) return ok(preserveReply(state, 'O formulário não foi enviado corretamente. Tente novamente.'));
      submitted = validated;
      const correction = submitted.correction === true && recordOf(currentStep.flow)?.correction;
      const target = typeof correction === 'string' ? correction : typeof submitted.target === 'string' ? submitted.target : requestTarget(currentStep);
      if (!target || !(currentStep.destinations.includes(target) || target === correction) || !assistanceCatalog.byId[target]) {
        return ok(preserveReply(state, 'O destino deste formulário não corresponde à etapa atual.'));
      }
      if (state.screenId === 'IDE-08') {
        const cpf = submitted.authCpf ?? submitted.cpf;
        transitionInput = { type: 'cpf_submit', cpf: typeof cpf === 'string' ? cpf : '' };
      } else if (typeof correction === 'string') {
        transitionInput = { type: 'open', target: correction };
      } else if (assistanceCatalog.byId[state.screenId]?.mode === 'review' || state.screenId === 'PRE-02') {
        const mutationData = state.screenId === 'PRE-02' ? submitted : state.temporaryData ?? {};
        const mutation = await confirmedMutation(assistanceCatalog.byId[state.screenId]!, mutationData, deps);
        if (!mutation.ok) return ok(preserveReply(state, failureText[mutation.error]));
        const target = requestTarget(assistanceCatalog.byId[state.screenId]!);
        if (!target) return ok(preserveReply(state, 'A demonstração foi concluída.'));
        transitionInput = { type: 'open', target };
      } else {
        const fields = stringFields(submitted);
        if (!fields) return ok(preserveReply(state, 'O formulário não foi enviado corretamente. Tente novamente.'));
        const allowedTarget = typeof submitted.target === 'string' && assistanceCatalog.byId[state.screenId]!.destinations.includes(submitted.target)
          ? submitted.target : requestTarget(assistanceCatalog.byId[state.screenId]!);
        transitionInput = allowedTarget
          ? { type: 'open', target: allowedTarget }
          : { type: 'open', target: state.screenId };
        submitted = fields;
      }
      break;
    }
    default:
      return ok({ state, replies: [] });
  }

  if (!transitionInput) return ok({ state, replies: [] });
  const transition = nextAssistanceState(state, transitionInput);
  let nextState = transition.state;
  const requestedTarget = transitionInput.type === 'open' || transitionInput.type === 'quick_reply'
    ? transitionInput.target
    : input.type === 'text' ? targetForText(input.text)?.id : undefined;
  if (requestedTarget && assistanceCatalog.byId[requestedTarget]?.requiresAuth && !state.gateApproved && assistanceCatalog.byId[requestedTarget]!.journeyId !== 'IDE') {
    nextState = { ...nextState, pendingStep: requestedTarget };
  }
  if (submitted && state.screenId !== 'IDE-08' && assistanceCatalog.byId[state.screenId]?.mode !== 'review') {
    nextState = { ...nextState, temporaryData: { ...state.temporaryData, ...stringFields(submitted) } };
  }
  if (transitionInput.type === 'cpf_submit' && nextState.gateApproved && state.pendingStep) {
    const pending = nextAssistanceState(nextState, { type: 'open', target: state.pendingStep });
    nextState = pending.state;
    return ok({ state: nextState, replies: textReply(pending.step) });
  }

  if (input.type === 'text' && (state.screenId === 'DEP-33' || state.screenId === 'DEP-04')) {
    const parsed = parseDependentStatement(input.text, state.temporaryData ?? {});
    const data = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, value ?? '']));
    nextState = { ...nextState, temporaryData: { ...state.temporaryData, ...data } };
  }

  const step = transition.step;
  let replies: ReplyBody[];
  if (isDocumentScreen(step.id) && step.mode === 'document') {
    const docs = await port.listDocuments(sessionId, step.id, context);
    if (!docs.ok) return ok(preserveReply(state, failureText[docs.error]));
    replies = [{ type: 'message.document', payload: { documents: docs.value } } as ReplyBody];
  } else {
    replies = textReply(step);
  }
  if (step.id === 'DEP-10') {
    const dependents = await port.listDependents(sessionId, context);
    if (!dependents.ok) return ok(preserveReply(state, failureText[dependents.error]));
    replies.push({
      type: 'message.text',
      payload: { text: `Dependentes demonstrativos cadastrados: ${dependents.value.length}.` },
    } as ReplyBody);
  }
  return ok({ state: nextState, replies });
}

/** Bounded, expiring state store for assistance journeys; CPF gate input is never stored. */
export class InMemoryAssistanceStateStore {
  private readonly entries = new Map<string, { state: AssistanceState; updatedAt: number }>();
  constructor(private readonly capacity: number, private readonly ttlMs: number, private readonly now: () => number = Date.now) {}
  get(sessionId: string): AssistanceState | undefined {
    const entry = this.entries.get(sessionId);
    if (!entry) return undefined;
    if (this.now() - entry.updatedAt > this.ttlMs) { this.entries.delete(sessionId); return undefined; }
    return entry.state;
  }
  set(sessionId: string, state: AssistanceState): void {
    this.entries.delete(sessionId);
    this.entries.set(sessionId, { state, updatedAt: this.now() });
    while (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!);
  }
  clear(sessionId: string): void {
    this.entries.delete(sessionId);
  }
}

/** Resolve only exact catalog utterances, leaving legacy intent handling untouched. */
export const assistanceStepForText = targetForText;
export const assistanceStepForAudio = (mediaId: string): AssistanceStep | undefined => {
  const step = assistanceCatalog.byId[mediaId];
  return step?.mode === 'audio' ? step : undefined;
};
export const assistanceEntry = (target: string) => nextAssistanceState(
  { journeyId: '', screenId: '', gateApproved: false }, { type: 'open', target },
);
