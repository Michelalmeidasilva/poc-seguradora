import { assistanceCatalog, type AssistanceStep } from './assistance-catalog';
import { parseAssistanceCpf } from './assistance-cpf';

export interface AssistanceState {
  journeyId: string;
  screenId: string;
  gateApproved: boolean;
  pendingStep?: string;
  temporaryData?: Readonly<Record<string, string>>;
  confirmedData?: Readonly<Record<string, string>>;
}

export type AssistanceInput =
  | { type: 'open'; target: string }
  | { type: 'quick_reply'; target: string; offeredFrom: string }
  | { type: 'cpf_submit'; cpf: string }
  | { type: 'confirm'; target: string };

export interface AssistanceTransition {
  step: AssistanceStep;
  state: AssistanceState;
}

const personalGate = assistanceCatalog.byId['IDE-01']!;

function customerFacingStep(step: AssistanceStep): AssistanceStep {
  if (step.journeyId !== 'IDE') return step;

  const actions = step.actions.map((action) => ({
    ...action,
    label: action.label === 'Já tenho código'
      ? 'Continuar'
      : action.label === 'Confirmar identidade'
        ? 'Confirmar ação'
        : action.label,
  }));
  const flow = step.flow && typeof step.flow === 'object'
    ? {
        ...(step.flow as Record<string, unknown>),
        ...(step.id === 'IDE-02' ? {
          title: 'Validar formato do CPF',
          note: 'Somente o formato do CPF é verificado nesta demonstração.',
        } : {}),
        ...(step.id === 'IDE-08' ? {
          title: 'Informar CPF',
          submit: 'Validar formato',
        } : {}),
      }
    : step.flow;
  const behavior = step.id === 'IDE-03'
    ? 'Apenas o formato do CPF foi aceito; nenhuma verificação de identidade foi realizada.'
    : step.behavior;

  return { ...step, actions, flow, behavior };
}

function transition(state: AssistanceState, step: AssistanceStep, gateApproved = state.gateApproved): AssistanceTransition {
  return {
    step: customerFacingStep(step),
    state: { ...state, journeyId: step.journeyId, screenId: step.id, gateApproved },
  };
}

function preserve(state: AssistanceState): AssistanceTransition {
  return transition(state, assistanceCatalog.byId[state.screenId] ?? personalGate, state.gateApproved);
}

export function nextAssistanceState(state: AssistanceState, input: AssistanceInput): AssistanceTransition {
  if (input.type === 'cpf_submit') {
    if (state.screenId !== 'IDE-08') return preserve(state);
    const parsed = parseAssistanceCpf(input.cpf);
    const step = assistanceCatalog.byId[parsed.ok ? 'IDE-03' : 'IDE-04']!;
    return transition(state, step, parsed.ok);
  }

  const target = assistanceCatalog.byId[input.target];
  if (!target || input.target.startsWith('LEG-')) return preserve(state);
  if (input.type === 'quick_reply') {
    const current = assistanceCatalog.byId[state.screenId];
    if (input.offeredFrom !== state.screenId || !current?.destinations.includes(input.target)) {
      return preserve(state);
    }
  } else if (input.type === 'confirm') {
    const current = assistanceCatalog.byId[state.screenId];
    if (!current || current.mode !== 'review' || !current.destinations.includes(input.target)) {
      return preserve(state);
    }
  }

  if (target.requiresAuth && !state.gateApproved && target.journeyId !== 'IDE') {
    return transition(state, personalGate, false);
  }
  return transition(state, target);
}
