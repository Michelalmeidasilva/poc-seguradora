import type { Result } from '@seguradora/protocol';
import type { ServiceCall, Step } from '../domain/dialog';
import type {
  Claim,
  ClaimOpened,
  Policy,
  PolicySummary,
  Quote,
  SecondCopy,
  ServiceFailure,
} from '../domain/models';

export interface Fakes {
  listPolicies?: Result<PolicySummary[], ServiceFailure>;
  getPolicy?: Result<Policy, ServiceFailure>;
  secondCopy?: Result<SecondCopy, ServiceFailure>;
  createQuote?: Result<Quote, ServiceFailure>;
  openClaim?: Result<ClaimOpened, ServiceFailure>;
  getClaim?: Result<Claim, ServiceFailure>;
}

export type ReplyStep = Extract<Step, { kind: 'reply' }>;

/** Runs a dialog step to its final reply, answering each service call with a canned result. */
export function drive(first: Step, fakes: Fakes): { final: ReplyStep; calls: ServiceCall[] } {
  const calls: ServiceCall[] = [];
  let step = first;
  while (step.kind === 'call') {
    const call = step.call;
    calls.push(call);
    const missing = () => new Error(`no fake result for ${call.op}`);
    switch (call.op) {
      case 'listPolicies':
        if (!fakes.listPolicies) throw missing();
        step = call.then(fakes.listPolicies);
        break;
      case 'getPolicy':
        if (!fakes.getPolicy) throw missing();
        step = call.then(fakes.getPolicy);
        break;
      case 'secondCopy':
        if (!fakes.secondCopy) throw missing();
        step = call.then(fakes.secondCopy);
        break;
      case 'createQuote':
        if (!fakes.createQuote) throw missing();
        step = call.then(fakes.createQuote);
        break;
      case 'openClaim':
        if (!fakes.openClaim) throw missing();
        step = call.then(fakes.openClaim);
        break;
      case 'getClaim':
        if (!fakes.getClaim) throw missing();
        step = call.then(fakes.getClaim);
        break;
    }
  }
  return { final: step, calls };
}
