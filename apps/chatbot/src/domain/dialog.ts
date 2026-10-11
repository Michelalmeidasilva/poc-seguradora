import type { Result } from '@seguradora/protocol';
import * as catalog from './catalog';
import { CLAIM_TYPES, isPolicyNumber, normalizeCpf, normalizeProtocol } from './identifiers';
import type {
  Claim,
  ClaimOpened,
  ClaimRequest,
  ClaimType,
  Policy,
  PolicySummary,
  Quote,
  QuoteRequest,
  SecondCopy,
  ServiceFailure,
} from './models';
import { parseQuoteSubmit } from './quote-submit';
import type { ReplyBody } from './reply';

export type IntentName =
  | 'greeting'
  | 'quote'
  | 'policies'
  | 'claim'
  | 'claim_status'
  | 'location'
  | 'help'
  | 'cancel'
  | 'unknown';

export interface Intent {
  name: IntentName;
  entities: { cpf?: string; apolice?: string; protocolo?: string };
}

export type DialogState =
  | { name: 'idle' }
  | { name: 'quote.awaiting_flow' }
  | { name: 'policies.awaiting_cpf' }
  | { name: 'policies.awaiting_choice'; numeros: string[] }
  | { name: 'claim.awaiting_cpf' }
  | { name: 'claim.awaiting_policy'; numeros: string[] }
  | { name: 'claim.awaiting_type'; apolice: string }
  | { name: 'claim.awaiting_description'; apolice: string; tipo: ClaimType }
  | { name: 'claim_status.awaiting_protocol' };

export const IDLE: DialogState = { name: 'idle' };

export type Input =
  | { kind: 'text'; text: string; intent: Intent }
  | { kind: 'choice'; optionId: string }
  | { kind: 'flow_submit'; flowId: string; data: unknown }
  | { kind: 'voice'; durationMs: number };

type Outcome<T> = Result<T, ServiceFailure>;

/** A call to an internal service, with the continuation that turns its result into the next step. */
export type ServiceCall =
  | { op: 'listPolicies'; cpf: string; then: (r: Outcome<PolicySummary[]>) => Step }
  | { op: 'getPolicy'; numero: string; then: (r: Outcome<Policy>) => Step }
  | { op: 'secondCopy'; numero: string; then: (r: Outcome<SecondCopy>) => Step }
  | { op: 'createQuote'; request: QuoteRequest; then: (r: Outcome<Quote>) => Step }
  | { op: 'openClaim'; request: ClaimRequest; then: (r: Outcome<ClaimOpened>) => Step }
  | { op: 'getClaim'; protocolo: string; then: (r: Outcome<Claim>) => Step };

export type Step =
  { kind: 'reply'; state: DialogState; replies: ReplyBody[] } | { kind: 'call'; call: ServiceCall };

export interface DialogContext {
  /** Today as YYYY-MM-DD (used as the occurrence date of a new claim). */
  today: string;
}

const MAX_DESCRIPTION = 1000;
const reply = (state: DialogState, replies: ReplyBody[]): Step => ({
  kind: 'reply',
  state,
  replies,
});
const call = (c: ServiceCall): Step => ({ kind: 'call', call: c });

/** Interprets one input in the current state. Pure: service calls are returned, not executed. */
export function next(state: DialogState, input: Input, ctx: DialogContext): Step {
  return interrupt(state, input) ?? byState(state, input, ctx);
}

/** Inputs that work from any state (menu, intents, stale buttons). */
function interrupt(state: DialogState, input: Input): Step | undefined {
  switch (input.kind) {
    case 'voice':
      return reply(state, catalog.voiceReceived(input.durationMs));
    case 'choice':
      return fromChoice(input.optionId);
    case 'flow_submit':
      return undefined;
    case 'text': {
      const { intent } = input;
      // While the user writes a free-text description only "cancel" interrupts.
      if (state.name === 'claim.awaiting_description') {
        return intent.name === 'cancel' ? reply(IDLE, catalog.menu()) : undefined;
      }
      switch (intent.name) {
        case 'cancel':
        case 'greeting':
        case 'help':
          return reply(IDLE, catalog.menu());
        case 'quote':
          return startQuote();
        case 'policies':
          return intent.entities.apolice
            ? viewPolicy(intent.entities.apolice)
            : startPolicies(intent.entities.cpf);
        case 'claim':
          return startClaim(intent.entities.cpf);
        case 'claim_status':
          return startClaimStatus(intent.entities.protocolo);
        case 'location':
          return reply(IDLE, catalog.branchLocation());
        case 'unknown':
          return undefined;
      }
    }
  }
}

function fromChoice(id: string): Step | undefined {
  switch (id) {
    case 'menu':
      return reply(IDLE, catalog.menu());
    case 'menu.quote':
      return startQuote();
    case 'menu.policies':
      return startPolicies();
    case 'menu.claim':
      return startClaim();
  }
  const [prefix, ...rest] = id.split(':');
  const value = rest.join(':');
  switch (prefix) {
    case 'policy':
      return isPolicyNumber(value) ? viewPolicy(value) : reply(IDLE, catalog.unknown());
    case 'policy.second_copy':
      return isPolicyNumber(value) ? secondCopy(value) : reply(IDLE, catalog.unknown());
    case 'policy.claim':
    case 'claimpolicy':
      return isPolicyNumber(value)
        ? reply({ name: 'claim.awaiting_type', apolice: value }, catalog.claimTypeChoices(value))
        : reply(IDLE, catalog.unknown());
    default:
      return undefined;
  }
}

function byState(state: DialogState, input: Input, ctx: DialogContext): Step {
  switch (state.name) {
    case 'idle':
      return reply(IDLE, catalog.unknown());

    case 'quote.awaiting_flow':
      if (input.kind === 'flow_submit' && input.flowId === 'cotacao') {
        const parsed = parseQuoteSubmit(input.data);
        if (!parsed.ok) return reply(state, catalog.quoteInvalid());
        return call({
          op: 'createQuote',
          request: parsed.value,
          then: (r) =>
            r.ok
              ? reply(IDLE, catalog.quoteResult(r.value))
              : failure(r.error, state, catalog.invalidData()),
        });
      }
      return reply(state, catalog.quoteFlow());

    case 'policies.awaiting_cpf': {
      const cpf = cpfFrom(input);
      return cpf ? startPolicies(cpf) : reply(state, catalog.invalidCpf());
    }

    case 'policies.awaiting_choice': {
      const numero = apoliceFrom(input, state.numeros);
      return numero ? viewPolicy(numero) : reply(state, catalog.pickAnOption());
    }

    case 'claim.awaiting_cpf': {
      const cpf = cpfFrom(input);
      return cpf ? startClaim(cpf) : reply(state, catalog.invalidCpf());
    }

    case 'claim.awaiting_policy': {
      const numero = apoliceFrom(input, state.numeros);
      return numero
        ? reply({ name: 'claim.awaiting_type', apolice: numero }, catalog.claimTypeChoices(numero))
        : reply(state, catalog.pickAnOption());
    }

    case 'claim.awaiting_type': {
      if (input.kind === 'choice' && input.optionId.startsWith('claim.type:')) {
        const tipo = CLAIM_TYPES.find((t) => `claim.type:${t}` === input.optionId);
        if (tipo) {
          return reply(
            { name: 'claim.awaiting_description', apolice: state.apolice, tipo },
            catalog.askClaimDescription(),
          );
        }
      }
      return reply(state, catalog.claimTypeChoices(state.apolice));
    }

    case 'claim.awaiting_description': {
      if (input.kind !== 'text') return reply(state, catalog.askClaimDescription());
      const descricao = input.text.trim();
      if (descricao.length === 0) return reply(state, catalog.askClaimDescription());
      if (descricao.length > MAX_DESCRIPTION) return reply(state, catalog.descriptionTooLong());
      return call({
        op: 'openClaim',
        request: {
          apoliceNumero: state.apolice,
          tipo: state.tipo,
          dataOcorrencia: ctx.today,
          descricao,
        },
        then: (r) => {
          if (r.ok) return reply(IDLE, catalog.claimOpened(r.value));
          if (r.error === 'conflict') return reply(IDLE, catalog.claimRejected());
          return failure(r.error, state, catalog.notFound('policy'));
        },
      });
    }

    case 'claim_status.awaiting_protocol': {
      const protocolo = protocolFrom(input);
      return protocolo ? viewClaim(protocolo) : reply(state, catalog.askClaimProtocol());
    }
  }
}

function startQuote(): Step {
  return reply({ name: 'quote.awaiting_flow' }, catalog.quoteFlow());
}

function startPolicies(cpf?: string): Step {
  if (!cpf) return reply({ name: 'policies.awaiting_cpf' }, catalog.askCpf('policies'));
  const keep: DialogState = { name: 'policies.awaiting_cpf' };
  return call({
    op: 'listPolicies',
    cpf,
    then: (r) => {
      if (!r.ok) return failure(r.error, keep, catalog.notFound('policy'));
      if (r.value.length === 0) return reply(IDLE, catalog.noPolicies());
      const shown = r.value.slice(0, 3);
      return reply(
        { name: 'policies.awaiting_choice', numeros: shown.map((p) => p.numero) },
        catalog.policyChoices(r.value, 'policy'),
      );
    },
  });
}

function viewPolicy(numero: string): Step {
  if (!isPolicyNumber(numero)) return reply(IDLE, catalog.unknown());
  return call({
    op: 'getPolicy',
    numero,
    then: (r) =>
      r.ok
        ? reply(IDLE, catalog.policyDetail(r.value))
        : failure(r.error, IDLE, catalog.notFound('policy')),
  });
}

function secondCopy(numero: string): Step {
  return call({
    op: 'secondCopy',
    numero,
    then: (r) => {
      if (r.ok) return reply(IDLE, catalog.secondCopy(r.value));
      if (r.error === 'conflict') return reply(IDLE, catalog.secondCopyRejected());
      return failure(r.error, IDLE, catalog.notFound('policy'));
    },
  });
}

function startClaim(cpf?: string): Step {
  if (!cpf) return reply({ name: 'claim.awaiting_cpf' }, catalog.askCpf('claim'));
  const keep: DialogState = { name: 'claim.awaiting_cpf' };
  return call({
    op: 'listPolicies',
    cpf,
    then: (r) => {
      if (!r.ok) return failure(r.error, keep, catalog.notFound('policy'));
      const active = r.value.filter((p) => p.status === 'ATIVA');
      if (active.length === 0) return reply(IDLE, catalog.noActivePolicies());
      const [only] = active;
      if (active.length === 1 && only) {
        return reply(
          { name: 'claim.awaiting_type', apolice: only.numero },
          catalog.claimTypeChoices(only.numero),
        );
      }
      const shown = active.slice(0, 3);
      return reply(
        { name: 'claim.awaiting_policy', numeros: shown.map((p) => p.numero) },
        catalog.policyChoices(active, 'claimpolicy'),
      );
    },
  });
}

function startClaimStatus(protocolo?: string): Step {
  const normalized = protocolo ? normalizeProtocol(protocolo) : undefined;
  return normalized
    ? viewClaim(normalized)
    : reply({ name: 'claim_status.awaiting_protocol' }, catalog.askClaimProtocol());
}

function viewClaim(protocolo: string): Step {
  return call({
    op: 'getClaim',
    protocolo,
    then: (r) =>
      r.ok
        ? reply(IDLE, catalog.claimDetail(r.value))
        : failure(r.error, IDLE, catalog.notFound('claim')),
  });
}

/** `unavailable` keeps the current state so the user can simply repeat the step. */
function failure(f: ServiceFailure, keep: DialogState, notFoundReply: ReplyBody[]): Step {
  switch (f) {
    case 'unavailable':
      return reply(keep, catalog.serviceUnavailable());
    case 'not_found':
      return reply(IDLE, notFoundReply);
    case 'conflict':
      return reply(IDLE, catalog.conflict());
    case 'invalid':
      return reply(IDLE, catalog.invalidData());
  }
}

const cpfFrom = (input: Input): string | undefined =>
  input.kind === 'text' ? (input.intent.entities.cpf ?? normalizeCpf(input.text)) : undefined;

function apoliceFrom(input: Input, allowed: string[]): string | undefined {
  if (input.kind === 'choice') {
    const [prefix, value] = input.optionId.split(':');
    return (prefix === 'policy' || prefix === 'claimpolicy') && value && allowed.includes(value)
      ? value
      : undefined;
  }
  if (input.kind === 'text') {
    const candidate = input.intent.entities.apolice;
    return candidate && allowed.includes(candidate) ? candidate : undefined;
  }
  return undefined;
}

const protocolFrom = (input: Input): string | undefined =>
  input.kind === 'text'
    ? (normalizeProtocol(input.intent.entities.protocolo ?? '') ?? normalizeProtocol(input.text))
    : undefined;
