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

const personalGate = assistanceCatalog.byId['IDE-01']!;

export function nextAssistanceState(state: AssistanceState, input: AssistanceInput): AssistanceStep {
  if (input.type === 'cpf_submit') {
    if (state.screenId !== 'IDE-08') return assistanceCatalog.byId[state.screenId] ?? personalGate;
    const parsed = parseAssistanceCpf(input.cpf);
    const step = assistanceCatalog.byId[parsed.ok ? 'IDE-03' : 'IDE-04']!;
    if (!parsed.ok) return step;
    return {
      ...step,
      behavior: 'Apenas o formato do CPF foi aceito; nenhuma verificação de identidade foi realizada.',
    };
  }

  const target = assistanceCatalog.byId[input.target];
  if (!target || input.target.startsWith('LEG-')) return assistanceCatalog.byId[state.screenId] ?? personalGate;
  if (input.type === 'quick_reply') {
    const current = assistanceCatalog.byId[state.screenId];
    if (input.offeredFrom !== state.screenId || !current?.destinations.includes(input.target)) {
      return current ?? personalGate;
    }
  } else if (input.type === 'confirm') {
    const current = assistanceCatalog.byId[state.screenId];
    if (!current || current.mode !== 'review' || !current.destinations.includes(input.target)) {
      return current ?? personalGate;
    }
  }

  if (target.requiresAuth && !state.gateApproved && target.journeyId !== 'IDE') return personalGate;
  return target;
}
