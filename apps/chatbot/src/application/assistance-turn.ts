import { err, ok, type Result } from '@seguradora/protocol';
import { z } from 'zod';
import { assistanceCatalog, type AssistanceStep } from '../domain/assistance-catalog';
import {
  isAssistanceCpfPrompt,
  nextAssistanceState,
  type AssistanceState,
} from '../domain/assistance-journey';
import { assistanceFlows } from '../domain/flows';
import { parseAssistanceCpf } from '../domain/assistance-cpf';
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

const preserveReply = (state: AssistanceState, text: string): AssistanceTurnResult => {
  const step = assistanceCatalog.byId[state.screenId];
  return {
    state,
    replies: [
      { type: 'message.text', payload: { text } } as ReplyBody,
      ...(step
        ? textReply(
            step,
            state,
            step.mode === 'review' && state.temporaryData ? 'review' : undefined,
          )
        : []),
    ],
  };
};

const recordOf = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const stringFields = (value: unknown): Record<string, string> | undefined => {
  const record = recordOf(value);
  if (!record || Object.keys(record).length > 20) return undefined;
  const pairs = Object.entries(record);
  if (
    pairs.some(
      ([, item]) =>
        (typeof item !== 'string' && typeof item !== 'boolean') ||
        (typeof item === 'string' && item.length > 500),
    )
  )
    return undefined;
  return Object.fromEntries(pairs.map(([key, item]) => [key, String(item)]));
};

function validateFlowData(
  step: AssistanceStep,
  input: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const flow = recordOf(step.flow);
  if (flow?.contracting) {
    const parsed = z
      .object({
        holder: z.string().trim().min(1).max(500),
        email: z.string().trim().email().max(500),
        payment: z.enum(['Cartão cadastrado •• 2048', 'Outro meio disponível']),
        consent: z.literal(true),
      })
      .strict()
      .safeParse(input);
    return parsed.success ? parsed.data : undefined;
  }
  if (flow?.discovery) {
    const parsed = z
      .object({
        intent: z.enum(['finish', 'contract']),
        service: z.enum(['0', '1', '2']),
        modality: z.enum(['individual', 'familiar']),
        cpf: z.string().max(14).optional(),
      })
      .strict()
      .safeParse(input);
    if (!parsed.success) return undefined;
    const { intent, service, modality } = parsed.data;
    const selection = { intent, service, modality };
    return { ...selection, target: selection.intent === 'contract' ? 'ADE-01' : 'DES-11' };
  }
  const fields = Array.isArray(flow?.fields)
    ? flow.fields.map(recordOf).filter((item) => item !== undefined)
    : [];
  const choices = Array.isArray(flow?.choices)
    ? flow.choices.map(recordOf).filter((item) => item !== undefined)
    : [];
  if (fields.length) {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const field of fields) {
      if (typeof field!.name !== 'string') return undefined;
      const name = field!.name;
      const options = field!.choices;
      let schema: z.ZodTypeAny =
        field!.type === 'checkbox'
          ? z.preprocess(
              (value) => (value === 'true' ? true : value === 'false' ? false : value),
              z.boolean(),
            )
          : z.string().max(500);
      if (
        Array.isArray(options) &&
        options.length > 0 &&
        options.every((option) => typeof option === 'string')
      ) {
        const allowed = options.filter((option) => option !== 'Selecione') as string[];
        if (allowed.length === 0) return undefined;
        schema = z.enum(allowed as [string, ...string[]]);
      }
      if (field!.required === true && field!.type !== 'checkbox' && !Array.isArray(options))
        schema = z.string().min(1).max(500);
      shape[name] = field!.required === true ? schema : schema.optional();
    }
    const parsed = z.object(shape).strict().safeParse(input);
    return parsed.success ? parsed.data : undefined;
  }
  if (choices.length) {
    const targets = choices.map((choice) => choice!.target);
    if (!targets.length || targets.some((target) => typeof target !== 'string')) return undefined;
    const index = z
      .object({ choice: z.enum(choices.map((_, i) => String(i)) as [string, ...string[]]) })
      .strict()
      .safeParse(input);
    if (index.success) return { target: targets[Number(index.data.choice)] };
    const legacy = z
      .object({ target: z.enum(targets as [string, ...string[]]) })
      .strict()
      .safeParse(input);
    return legacy.success ? legacy.data : undefined;
  }
  if (
    typeof flow?.correction === 'string' &&
    input.correction === true &&
    Object.keys(input).length === 1
  ) {
    return { correction: true };
  }
  if (flow?.consent !== undefined) {
    const parsed = z
      .object({ consent: z.literal(true) })
      .strict()
      .safeParse(input);
    return parsed.success ? parsed.data : undefined;
  }
  return z.object({}).strict().safeParse(input).success ? input : undefined;
}

const flowInitialData = (
  step: AssistanceStep,
  state: AssistanceState | undefined,
  intent: 'review' | 'correction' | undefined,
) => {
  if (step.id === 'ADE-03' && state?.temporaryData) {
    return {
      intent: 'correction' as const,
      values: Object.fromEntries(
        ['holder', 'email', 'payment']
          .filter((key) => state.temporaryData?.[key] !== undefined)
          .map((key) => [key, state.temporaryData![key]]),
      ),
    };
  }
  if (step.id === 'DES-01' && state?.temporaryData?.service) {
    return {
      intent: 'correction' as const,
      values: {
        service: state.temporaryData.service,
        ...(state.temporaryData.modality ? { modality: state.temporaryData.modality } : {}),
      },
    };
  }
  if (!state || !intent || step.journeyId !== state.journeyId || !state.temporaryData)
    return undefined;
  const values = Object.fromEntries(
    Object.entries(state.temporaryData).filter(
      ([key, value]) =>
        !/^(cpf|document)$/i.test(key) && (typeof value === 'string' || typeof value === 'boolean'),
    ),
  );
  const cpf = state.temporaryData.cpf ?? state.temporaryData.document;
  if (intent === 'review' && typeof cpf === 'string') {
    const digits = cpf.replace(/\D/g, '');
    if (digits.length >= 2) values.maskedDocument = `•••.•••.•••-${digits.slice(-2)}`;
  }
  if (intent === 'correction') {
    const fields = Array.isArray(recordOf(step.flow)?.fields)
      ? (recordOf(step.flow)!.fields as unknown[])
      : [];
    for (const candidate of fields) {
      const field = recordOf(candidate);
      if (
        !field ||
        typeof field.name !== 'string' ||
        (field.sensitive !== true && !/^(cpf|document)$/i.test(field.name))
      )
        continue;
      const value =
        state.temporaryData[field.name] ?? (/^(cpf|document)$/i.test(field.name) ? cpf : undefined);
      if (typeof value === 'string') values[field.name] = value;
    }
  }
  return { intent, values };
};

const quickOptionId = (step: AssistanceStep, index: number): string => {
  const target = step.actions[index]!.target;
  return step.actions.slice(0, index).some((action) => action.target === target)
    ? `${step.id}:${index}`
    : target;
};

const textReply = (
  step: AssistanceStep,
  state?: AssistanceState,
  intent?: 'review' | 'correction',
  listChoices?: Array<{ id: string; title: string; description: string }>,
): ReplyBody[] => {
  const replies: ReplyBody[] = [];
  let body = step.bot;
  const draft = state?.temporaryData;
  if (step.id === 'EXC-01' && !listChoices && draft?.exclusionChoices) {
    listChoices = JSON.parse(draft.exclusionChoices) as Array<{
      id: string;
      title: string;
      description: string;
    }>;
  }
  const individualPlan =
    draft?.modality === 'individual' && ['ADE', 'PAG'].includes(step.journeyId);
  const personalize = (text: string) => {
    if (
      step.id === 'ADE-03' &&
      individualPlan &&
      text === recordOf(recordOf(step.flow)?.contracting)?.participants
    )
      return 'Este plano atende somente o titular.';
    const personalized =
      step.journeyId === 'EXC' && draft?.dependentName
        ? text.replace(/Maria Silva|Maria/g, () => draft.dependentName!)
        : text;
    return individualPlan
      ? personalized.replaceAll('Familiar', 'Individual').replaceAll('R$ 39,90', 'R$ 29,90')
      : personalized;
  };
  body = personalize(body);
  const discovery = recordOf(assistanceCatalog.byId['DES-01']?.flow)?.discovery as
    { services: Array<{ id: string; title: string }> } | undefined;
  const selectedService = discovery?.services.find((service) => service.id === draft?.service);
  if (selectedService && ['ADE', 'PAG'].includes(step.journeyId)) {
    body = body.replaceAll('Serviços de Assistência', selectedService.title);
  }
  if (step.id === 'DEP-33' && draft?.name) {
    const birth = draft.birth?.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1');
    const cpf = (draft.cpf ?? draft.document ?? '').replace(/\D/g, '');
    body = body
      .replace('dados do João', `dados de ${draft.name}`)
      .replaceAll('João da Silva', draft.name);
    if (birth) body = body.replaceAll('12/03/2004', birth);
    if (cpf.length === 11) body = body.replaceAll('•••.•••.•••-10', `•••.•••.•••-${cpf.slice(-2)}`);
    if (draft.relationship)
      body = body.replace('**Parentesco:** filho', `**Parentesco:** ${draft.relationship}`);
  }
  if (step.id === 'DEP-34' && draft?.name) {
    body = body.replace('do João', `de ${draft.name}`).replace('ele informa', 'a pessoa informa');
  }
  if (step.mode === 'chat' || step.mode === 'audio') {
    replies.push({ type: 'message.text', payload: { text: body } } as ReplyBody);
  } else if (step.mode !== 'document') {
    const initialData = flowInitialData(step, state, intent);
    const hydrate = (value: unknown): unknown => {
      if (typeof value === 'string') {
        const personalized = personalize(value);
        return selectedService && ['ADE', 'PAG'].includes(step.journeyId)
          ? personalized.replaceAll('Serviços de Assistência', selectedService.title)
          : personalized;
      }
      if (Array.isArray(value)) return value.map(hydrate).filter((child) => child !== undefined);
      if (!value || typeof value !== 'object') return value;
      const component = recordOf(value);
      if (step.id === 'DES-01' && state?.gateApproved && component?.name === 'cpf')
        return undefined;
      if (step.id === 'DES-01' && state?.gateApproved && component?.name === 'complete')
        return {
          ...component,
          payload: { intent: 'contract', service: '${data.service}', modality: '${form.modality}' },
        };
      if (listChoices && component?.type === 'RadioButtonsGroup' && component.name === 'choice')
        return { ...component, 'data-source': listChoices };
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
          key,
          key === 'text' && child === step.bot ? body : hydrate(child),
        ]),
      );
    };
    const flowJson = assistanceFlows[step.id] ?? { title: step.title };
    replies.push({
      type: 'message.flow',
      payload: {
        flowId: step.id,
        body,
        ctaLabel:
          step.id === 'ADE-03'
            ? 'Dados e pagamento'
            : step.mode === 'list'
              ? 'Selecionar uma opção'
              : step.mode === 'review'
                ? 'Abrir revisão'
                : 'Abrir formulário',
        flowJson:
          body === step.bot &&
          !listChoices &&
          !draft?.dependentName &&
          !individualPlan &&
          !(selectedService && ['ADE', 'PAG'].includes(step.journeyId)) &&
          !(step.id === 'DES-01' && state?.gateApproved)
            ? flowJson
            : hydrate(flowJson),
        ...(initialData ? { initialData } : {}),
      },
    } as ReplyBody);
  }
  if (step.actions.length) {
    replies.push({
      type: 'message.quick_replies',
      payload: {
        text: 'Escolha uma opção para continuar.',
        options: step.actions.map(({ label }, index) => ({
          id: quickOptionId(step, index),
          title: label,
        })),
      },
    } as ReplyBody);
  }
  return replies;
};

const failureText: Record<AssistanceFailure, string> = {
  not_found: 'Não encontrei essa informação. Confira a opção e tente novamente.',
  conflict: 'Não foi possível concluir esta etapa. Confira os dados e tente novamente.',
  invalid: 'Não consegui validar os dados enviados. Confira o formulário e tente novamente.',
  unavailable: 'Não foi possível continuar agora. Tente novamente em instantes.',
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
      if (
        !/^\d{11}$/.test(cpf) ||
        !name ||
        !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) ||
        !relationship ||
        !phone
      )
        return err('invalid');
      const rawSex = field('biologicalSex');
      const biologicalSex =
        rawSex === 'female' || rawSex === 'Feminino'
          ? 'female'
          : rawSex === 'male' || rawSex === 'Masculino'
            ? 'male'
            : rawSex === 'not_informed' || rawSex === 'Prefiro não informar'
              ? 'not_informed'
              : undefined;
      if (!biologicalSex) return err('invalid');
      const result = await port.addDependent(
        sessionId,
        {
          confirmed: true,
          dependent: {
            name,
            cpf,
            birthDate,
            relationship,
            phone,
            biologicalSex,
          },
        },
        context,
      );
      return result.ok ? ok(undefined) : result;
    }
    case 'DEP-21': {
      const id = field('dependentId');
      if (!id) return err('invalid');
      const changes =
        recordOf(data.changes) ??
        Object.fromEntries(
          [
            'name',
            'cpf',
            'birthDate',
            'birth',
            'document',
            'relationship',
            'phone',
            'biologicalSex',
          ]
            .filter((key) => typeof data[key] === 'string')
            .map((key) => [key, data[key]]),
        );
      if (!changes) return err('invalid');
      const result = await port.updateDependent(
        sessionId,
        { confirmed: true, dependentId: id, changes },
        context,
      );
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
      if (modality === 'individual') {
        const dependents = await port.listDependents(sessionId, context);
        if (!dependents.ok) return err(dependents.error);
        if (dependents.value.length) return err('conflict');
      }
      return port.changeModality(sessionId, { confirmed: true, modality }, context);
    }
    case 'CAN-05': {
      const result = await port.cancelAssistance(
        sessionId,
        { confirmed: true, reason: field('reason', 'motivo') || 'solicitado' },
        context,
      );
      return result.ok ? ok(undefined) : result;
    }
    case 'REN-03': {
      const result = await port.renewAssistance(sessionId, { confirmed: true }, context);
      return result.ok ? ok(undefined) : result;
    }
    case 'COB-05': {
      const reference = field('reference') || 'REF-DEMO-001';
      const result = await port.regularizeBilling(
        sessionId,
        { confirmed: true, reference },
        context,
      );
      return result.ok ? ok(undefined) : result;
    }
    case 'CAD-03': {
      const postal = field('postal');
      const address = field('address');
      const city = field('city');
      if (!postal || !address || !city) return err('invalid');
      return port
        .updateAddress(sessionId, { confirmed: true, postal, address, city }, context)
        .then((result) => (result.ok ? ok(undefined) : result));
    }
    case 'FUN-06': {
      const city = field('funeralCity');
      const state = field('funeralState');
      if (!city || !state) return err('invalid');
      return port
        .requestFuneralAssistance(sessionId, { confirmed: true, city, state }, context)
        .then((result) => (result.ok ? ok(undefined) : result));
    }
    case 'PRE-02': {
      if (typeof data.optionalDocs !== 'boolean' || typeof data.optionalBenefits !== 'boolean')
        return err('invalid');
      const current = await port.getPreferences(sessionId, context);
      if (!current.ok) return current;
      const updated = await port.updatePreferences(
        sessionId,
        {
          confirmed: true,
          preferences: {
            ...current.value,
            optionalDocs: data.optionalDocs,
            optionalBenefits: data.optionalBenefits,
          },
        },
        context,
      );
      return updated.ok ? ok(undefined) : updated;
    }
    default:
      return ok(undefined);
  }
}

function targetForText(text: string, state?: AssistanceState): AssistanceStep | undefined {
  const normalized = text.trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
  const greeting = normalized
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[!.?]+$/g, '');
  if (['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite'].includes(greeting)) {
    return assistanceCatalog.byId['ENT-02'];
  }
  const statement = parseDependentStatement(text);
  if (
    /\b(incluir|adicionar)\b/i.test(text) &&
    statement.name &&
    statement.cpf &&
    statement.birth &&
    statement.relationship
  ) {
    return assistanceCatalog.byId['DEP-33'];
  }
  const matches = assistanceCatalog.steps.filter(
    (candidate) =>
      candidate.user.trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ') === normalized,
  );
  // Conditional outcomes are selected by service data, not by an ambiguous
  // phrase. Ordinary shared intents stay in the current journey.
  return (
    (normalized === 'quero confirmar.'
      ? matches.find(
          (candidate) => candidate.journeyId === state?.journeyId && !candidate.alternative,
        )
      : undefined) ?? matches[0]
  );
}

export async function runAssistanceTurn(
  input: AssistanceInput,
  deps: AssistanceTurnDeps,
): Promise<Result<AssistanceTurnResult, AssistanceFailure>> {
  const { state, port, sessionId, context } = deps;
  const statement =
    input.type === 'text' &&
    !isAssistanceCpfPrompt(state.screenId) &&
    targetForText(input.text)?.id === 'DEP-33'
      ? parseDependentStatement(input.text)
      : undefined;
  if (input.type === 'flow_data_exchange') return ok({ state, replies: [] });
  const currentStep = assistanceCatalog.byId[state.screenId];
  if (input.type === 'quick_reply' && currentStep) {
    const optionId = input.target;
    const index = currentStep.actions.findIndex(
      (_, index) => quickOptionId(currentStep, index) === optionId,
    );
    if (index >= 0) input = { ...input, target: currentStep.actions[index]!.target };
  }
  if (
    input.type !== 'cpf_submit' &&
    state.journeyId !== 'IDE' &&
    currentStep?.requiresAuth &&
    !state.gateApproved
  ) {
    const gate = nextAssistanceState(state, { type: 'open', target: state.screenId });
    return ok({
      state: {
        ...gate.state,
        pendingStep: state.screenId,
        ...(statement
          ? { temporaryData: { ...state.temporaryData, ...statement } as Record<string, string> }
          : {}),
      },
      replies: textReply(gate.step),
    });
  }
  if (
    input.type === 'quick_reply' &&
    ['HUM-05', 'HUM-06'].includes(state.screenId) &&
    input.target === 'HUM-08'
  ) {
    const screen = assistanceCatalog.byId[state.screenId]!;
    if (
      !screen.actions.some(
        (action) =>
          action.target === input.target &&
          /solicitar retorno|registrar retorno/i.test(action.label),
      )
    ) {
      return ok(preserveReply(state, 'Esta opção não corresponde à etapa atual.'));
    }
    const created = await port.createRequest(
      sessionId,
      {
        confirmed: true,
        kind: 'human_handoff',
        message: 'Pedido de retorno solicitado pela pessoa',
      },
      context,
    );
    if (!created.ok) return ok(preserveReply(state, failureText[created.error]));
  }
  let discoveryCpfApproved = false;
  let transitionInput: Parameters<typeof nextAssistanceState>[1] | undefined;
  let submitted: Record<string, unknown> | undefined;
  let correctedBirth: string | undefined;
  if (input.type === 'quick_reply' && state.screenId === 'EXC-09' && input.target === 'EXC-10') {
    const dependentId = state.temporaryData?.dependentId;
    if (!dependentId) return ok(preserveReply(state, failureText.invalid));
    const undone = await port.cancelDependentRemoval(
      sessionId,
      { confirmed: true, dependentId },
      context,
    );
    if (!undone.ok) return ok(preserveReply(state, failureText[undone.error]));
  }

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
      if (isAssistanceCpfPrompt(state.screenId)) {
        transitionInput = { type: 'cpf_submit', cpf: input.text };
      } else if (state.screenId === 'DEP-33' || state.screenId === 'DEP-04') {
        transitionInput = { type: 'open', target: state.screenId };
      } else if (['DEP-14', 'DEP-16'].includes(state.screenId)) {
        correctedBirth = parseDependentStatement(input.text, {}, 'birth').birth;
        if (!correctedBirth)
          return ok(
            preserveReply(
              state,
              'Informe a data de nascimento correta, por exemplo: “A data correta é 20/05/2012”.',
            ),
          );
        transitionInput = { type: 'open', target: 'DEP-16' };
      } else {
        const step = targetForText(input.text, state);
        if (!step)
          return ok(
            preserveReply(state, 'Não entendi essa opção. Escolha uma das opções disponíveis.'),
          );
        transitionInput = { type: 'open', target: step.id };
      }
      break;
    }
    case 'voice':
      {
        const fixture = audioStepsById.get(input.mediaId);
        if (!fixture)
          return ok(preserveReply(state, 'Escolha uma das opções de áudio para continuar.'));
        transitionInput = { type: 'open', target: fixture.id };
      }
      break;
    case 'flow_submit': {
      if (input.flowId === 'IDE-08')
        return ok(preserveReply(state, 'Digite o CPF diretamente no chat para validar o formato.'));
      if (input.flowId !== state.screenId)
        return ok(preserveReply(state, 'Este formulário não corresponde à etapa atual.'));
      submitted = recordOf(input.data);
      if (!submitted)
        return ok(
          preserveReply(state, 'O formulário não foi enviado corretamente. Tente novamente.'),
        );
      const currentStep = assistanceCatalog.byId[state.screenId];
      if (!currentStep)
        return ok(
          preserveReply(
            state,
            'Esta etapa não está disponível. Escolha outra opção para continuar.',
          ),
        );
      let validated: Record<string, unknown> | undefined;
      if (currentStep.id === 'EXC-01') {
        const selection = z
          .object({ choice: z.string().regex(/^(0|[1-9]\d*)$/) })
          .strict()
          .safeParse(submitted);
        let ids: string[] = [];
        try {
          const cached = z
            .array(z.string())
            .safeParse(JSON.parse(state.temporaryData?.exclusionCandidates ?? '[]'));
          if (cached.success) ids = cached.data;
        } catch {
          return ok(preserveReply(state, failureText.invalid));
        }
        const id = selection.success ? ids[Number(selection.data.choice)] : undefined;
        if (!id) return ok(preserveReply(state, failureText.invalid));
        const dependents = await port.listDependents(sessionId, context);
        if (!dependents.ok) return ok(preserveReply(state, failureText[dependents.error]));
        const dependent = dependents.value.find((person) => person.id === id);
        if (!dependent) return ok(preserveReply(state, failureText.not_found));
        validated = { target: 'EXC-02', dependentId: dependent.id, dependentName: dependent.name };
      } else {
        validated = validateFlowData(currentStep, submitted);
      }
      if (!validated)
        return ok(
          preserveReply(state, 'O formulário não foi enviado corretamente. Tente novamente.'),
        );
      if (
        recordOf(currentStep.flow)?.discovery &&
        submitted.intent === 'contract' &&
        submitted.cpf
      ) {
        if (typeof submitted.cpf !== 'string' || !parseAssistanceCpf(submitted.cpf).ok)
          return ok(preserveReply(state, 'Informe um CPF com 11 dígitos, com ou sem pontuação.'));
        discoveryCpfApproved = true;
      }
      submitted =
        currentStep.id === 'PLA-02' && validated.target === 'PLA-03'
          ? { ...validated, modality: 'individual' }
          : validated;
      const correction = submitted.correction === true && recordOf(currentStep.flow)?.correction;
      const target =
        typeof correction === 'string'
          ? correction
          : typeof submitted.target === 'string'
            ? submitted.target
            : requestTarget(currentStep);
      if (
        !target ||
        !(currentStep.destinations.includes(target) || target === correction) ||
        !assistanceCatalog.byId[target]
      ) {
        return ok(
          preserveReply(state, 'O destino deste formulário não corresponde à etapa atual.'),
        );
      }
      if (typeof correction === 'string') {
        transitionInput = { type: 'open', target: correction };
      } else if (
        assistanceCatalog.byId[state.screenId]?.mode === 'review' ||
        state.screenId === 'PRE-02'
      ) {
        const mutationData = state.screenId === 'PRE-02' ? submitted : (state.temporaryData ?? {});
        const mutation = await confirmedMutation(
          assistanceCatalog.byId[state.screenId]!,
          mutationData,
          deps,
        );
        if (!mutation.ok) return ok(preserveReply(state, failureText[mutation.error]));
        const target = requestTarget(assistanceCatalog.byId[state.screenId]!);
        if (!target) return ok(preserveReply(state, 'Seu pedido foi concluído.'));
        transitionInput = { type: 'open', target };
      } else {
        const fields = stringFields(submitted);
        if (!fields)
          return ok(
            preserveReply(state, 'O formulário não foi enviado corretamente. Tente novamente.'),
          );
        const allowedTarget =
          typeof submitted.target === 'string' &&
          assistanceCatalog.byId[state.screenId]!.destinations.includes(submitted.target)
            ? submitted.target
            : requestTarget(assistanceCatalog.byId[state.screenId]!);
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
  const transition = nextAssistanceState(
    discoveryCpfApproved ? { ...state, gateApproved: true } : state,
    transitionInput,
  );
  let nextState = transition.state;
  let step = transition.step;
  if (step.id === 'IDE-06' && state.journeyId !== 'IDE' && currentStep?.mode === 'review') {
    nextState = { ...nextState, pendingStep: state.screenId };
  }
  const gateReplies: ReplyBody[] = [];
  if (transitionInput.type === 'cpf_submit' && isAssistanceCpfPrompt(state.screenId)) {
    gateReplies.push({
      type: 'message.text',
      payload: { text: assistanceCatalog.byId['IDE-02']!.bot },
    } as ReplyBody);
    if (nextState.gateApproved && state.pendingStep) {
      gateReplies.push({
        type: 'message.text',
        payload: { text: assistanceCatalog.byId['IDE-03']!.bot },
      } as ReplyBody);
    }
  }
  if (statement)
    nextState = {
      ...nextState,
      temporaryData: { ...state.temporaryData, ...statement } as Record<string, string>,
    };
  const requestedTarget =
    transitionInput.type === 'open' || transitionInput.type === 'quick_reply'
      ? transitionInput.target
      : input.type === 'text'
        ? targetForText(input.text)?.id
        : undefined;
  if (
    requestedTarget &&
    assistanceCatalog.byId[requestedTarget]?.requiresAuth &&
    !nextState.gateApproved &&
    assistanceCatalog.byId[requestedTarget]!.journeyId !== 'IDE'
  ) {
    nextState = { ...nextState, pendingStep: requestedTarget };
  }
  if (
    submitted &&
    state.screenId !== 'IDE-08' &&
    assistanceCatalog.byId[state.screenId]?.mode !== 'review'
  ) {
    nextState = {
      ...nextState,
      temporaryData: { ...state.temporaryData, ...stringFields(submitted) },
    };
  }
  if (transitionInput.type === 'cpf_submit' && nextState.gateApproved && state.pendingStep) {
    const pending = nextAssistanceState(nextState, { type: 'open', target: state.pendingStep });
    nextState = { ...pending.state };
    delete nextState.pendingStep;
    step = pending.step;
  }
  // Legacy payment entry points reopen the same contracting Flow with the saved draft.
  if (
    ['PAG-01', 'PAG-02', 'PAG-03', 'PAG-04', 'ADE-05'].includes(step.id) &&
    nextState.gateApproved
  ) {
    const unified = nextAssistanceState(nextState, { type: 'open', target: 'ADE-03' });
    nextState = unified.state;
    step = unified.step;
  }
  // An identified customer continues straight to holder details.
  if (step.id === 'ADE-02' && state.screenId === 'ADE-01' && nextState.gateApproved) {
    const holder = nextAssistanceState(nextState, { type: 'open', target: 'ADE-03' });
    nextState = holder.state;
    step = holder.step;
  }
  // The Individual choice carries through the same gate and skips dependent
  // collection, matching the already approved prototype's contracting branch.
  if (nextState.temporaryData?.modality === 'individual' && step.id === 'ADE-04') {
    const individual = nextAssistanceState(nextState, { type: 'open', target: 'ADE-05' });
    nextState = individual.state;
    step = individual.step;
  }

  if (input.type === 'text' && (state.screenId === 'DEP-33' || state.screenId === 'DEP-04')) {
    const parsed = parseDependentStatement(input.text, state.temporaryData ?? {});
    const data = Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, value ?? '']),
    );
    nextState = { ...nextState, temporaryData: { ...state.temporaryData, ...data } };
  }

  let listChoices: Array<{ id: string; title: string; description: string }> | undefined;
  if (step.id === 'EXC-01') {
    const dependents = await port.listDependents(sessionId, context);
    if (!dependents.ok) return ok(preserveReply(state, failureText[dependents.error]));
    if (!dependents.value.length) {
      const empty = nextAssistanceState(nextState, { type: 'open', target: 'IDE-07' });
      return ok({
        state: empty.state,
        replies: [...gateReplies, ...textReply(empty.step, empty.state)],
      });
    }
    listChoices = dependents.value.map((person, index) => ({
      id: String(index),
      title: person.name,
      description: `CPF: •••.•••.•••-${person.cpf.slice(-2)} · ${person.relationship} · vínculo ativo`,
    }));
    nextState = {
      ...nextState,
      temporaryData: {
        exclusionCandidates: JSON.stringify(dependents.value.map((person) => person.id)),
        exclusionChoices: JSON.stringify(listChoices),
      },
    };
  }
  // The canonical correction CTA simulates precisely the date stated by DEP-16.
  // Preserve every other draft field and still require the updated review's confirmation.
  if (correctedBirth) {
    nextState = { ...nextState, temporaryData: { ...state.temporaryData, birth: correctedBirth } };
  } else if (
    input.type === 'quick_reply' &&
    step.id === 'DEP-16' &&
    ['DEP-14', 'DEP-16'].includes(state.screenId)
  ) {
    const date = step.user.match(/\b\d{2}\/\d{2}\/\d{4}\b/)?.[0];
    const corrected = parseDependentStatement(
      `nascimento em ${date ?? ''}`,
      state.temporaryData ?? {},
      'birth',
    );
    nextState = {
      ...nextState,
      temporaryData: { ...state.temporaryData, ...corrected } as Record<string, string>,
    };
  }
  let replies: ReplyBody[];
  if (isDocumentScreen(step.id) && step.mode === 'document') {
    const docs = await port.listDocuments(sessionId, step.id, context);
    if (!docs.ok) return ok(preserveReply(state, failureText[docs.error]));
    replies = [
      { type: 'message.document', payload: { documents: docs.value } } as ReplyBody,
      ...textReply(step, nextState),
    ];
  } else {
    const hydrationIntent =
      step.mode === 'review' &&
      nextState.temporaryData &&
      step.journeyId === state.journeyId &&
      ((input.type === 'flow_submit' && currentStep?.mode === 'form') ||
        (state.screenId === 'DEP-16' && step.id === 'DEP-17'))
        ? 'review'
        : input.type === 'flow_submit' &&
            currentStep?.mode === 'review' &&
            submitted?.correction === true
          ? 'correction'
          : undefined;
    replies = textReply(step, nextState, hydrationIntent, listChoices);
  }
  if (step.id === 'DEP-10') {
    const dependents = await port.listDependents(sessionId, context);
    if (!dependents.ok) return ok(preserveReply(state, failureText[dependents.error]));
    replies.push({
      type: 'message.text',
      payload: { text: `Dependentes cadastrados: ${dependents.value.length}.` },
    } as ReplyBody);
  }
  return ok({ state: nextState, replies: [...gateReplies, ...replies] });
}

/** Bounded, expiring state store for assistance journeys; CPF gate input is never stored. */
export class InMemoryAssistanceStateStore {
  private readonly entries = new Map<string, { state: AssistanceState; updatedAt: number }>();
  constructor(
    private readonly capacity: number,
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}
  get(sessionId: string): AssistanceState | undefined {
    const result = this.read(sessionId);
    return result.status === 'active' ? result.state : undefined;
  }
  read(
    sessionId: string,
  ): { status: 'active'; state: AssistanceState } | { status: 'missing' | 'expired' } {
    const entry = this.entries.get(sessionId);
    if (!entry) return { status: 'missing' };
    if (this.now() - entry.updatedAt >= this.ttlMs) {
      this.entries.delete(sessionId);
      return { status: 'expired' };
    }
    return { status: 'active', state: entry.state };
  }
  set(sessionId: string, state: AssistanceState): void {
    this.entries.delete(sessionId);
    this.entries.set(sessionId, { state, updatedAt: this.now() });
    while (this.entries.size > this.capacity)
      this.entries.delete(this.entries.keys().next().value!);
  }
  clear(sessionId: string): void {
    this.entries.delete(sessionId);
  }
}

/** Common greetings open the assistance welcome; other utterances use the catalog. */
export const assistanceStepForText = targetForText;
export const assistanceStepForAudio = (mediaId: string): AssistanceStep | undefined => {
  const step = assistanceCatalog.byId[mediaId];
  return step?.mode === 'audio' ? step : undefined;
};
export const assistanceEntry = (target: string) =>
  nextAssistanceState(
    { journeyId: '', screenId: '', gateApproved: false },
    { type: 'open', target },
  );
