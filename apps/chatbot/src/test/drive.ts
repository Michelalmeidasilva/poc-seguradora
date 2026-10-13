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
import { assistanceCatalog, type AssistanceStep } from '../domain/assistance-catalog';
import { choiceReq, flowSubmitReq, textReq, turn, voiceReq, type TurnResult } from './harness';
import type { ChatbotRequest } from '@seguradora/protocol';

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

/** Replays user/API paths. No direct-open input, state injection, or debug route. */
export async function auditAssistancePaths(
  url: string,
  screenId: (session: string) => string | undefined,
) {
  type Action =
    | { type: 'text'; text: string }
    | { type: 'voice'; mediaId: string }
    | { type: 'choice'; id: string }
    | { type: 'flow'; id: string; data: Record<string, unknown> };
  const paths = new Map<string, Action[]>();
  const explored = new Set<string>();
  const intermediate = new Set<string>();
  const failures = new Set<string>();
  const labels = new Set<string>();
  const rows: Array<{ id: string; path?: string[]; condition: string }> = [];
  const dependentContext = (path: Action[]) => {
    if (path.some((action) => action.type === 'flow' && action.id === 'DEP-05')) return 2;
    const supplement = path.some((action) => action.type === 'flow' && action.id === 'DEP-34');
    if (!supplement) return 0;
    return path.some(
      (action) => action.type === 'text' && action.text === assistanceCatalog.byId['DEP-33']!.user,
    )
      ? 2
      : 1;
  };
  const remember = (id: string, path: Action[]) => {
    const previous = paths.get(id);
    const draftRank = (actions: Action[]) =>
      id.startsWith('DEP-') ? dependentContext(actions) : 0;
    const ownForm = (actions: Action[]) =>
      actions.some(
        (action) =>
          action.type === 'flow' &&
          action.id.startsWith(id.slice(0, 3)) &&
          Object.keys(action.data).some(
            (key) => key !== 'choice' && key !== 'consent' && key !== 'correction',
          ),
      );
    if (
      !previous ||
      draftRank(path) > draftRank(previous) ||
      (draftRank(path) === draftRank(previous) && ownForm(path) && !ownForm(previous))
    ) {
      paths.set(id, path);
    }
  };
  const formData: Record<string, Record<string, unknown>> = {
    'IDE-08': { cpf: '11111111111' },
    'DES-07': { composition: 'Somente eu' },
    'ADE-03': { holder: 'Ana Silva', email: 'ana@example.com' },
    'DEP-34': { phone: '11987654321', biologicalSex: 'Masculino' },
    'DEP-05': {
      name: 'Maria Silva',
      birth: '2014-03-12',
      document: '12345678910',
      relationship: 'Filha',
      phone: '11987654321',
      biologicalSex: 'Feminino',
    },
    'CAD-02': { postal: '01310100', address: 'Rua Exemplo, 10', city: 'São Paulo / SP' },
    'FUN-04': { funeralCity: 'São Paulo', funeralState: 'SP' },
    'COB-10': { dispute: 'Divergência demonstrativa' },
    'PRE-02': { optionalDocs: false, optionalBenefits: true },
  };
  let sequence = 0;
  const send = async (session: string, action: Action) => {
    let request: ChatbotRequest;
    switch (action.type) {
      case 'text':
        request = textReq(action.text, { session });
        break;
      case 'voice':
        request = voiceReq(18_000, { session, mediaId: action.mediaId });
        break;
      case 'choice':
        request = choiceReq(action.id, { session });
        break;
      case 'flow':
        request = flowSubmitReq(action.data, { session, flowId: action.id });
        break;
    }
    const result = await turn(url, request);
    for (const event of result.events) {
      if (event.type === 'error') failures.add(`outgoing:${event.payload.code}`);
      if (event.type === 'message.quick_replies') {
        const ids = event.payload.options.map((option) => option.id);
        if (new Set(ids).size !== ids.length) failures.add('duplicate emitted UI identity');
        for (const option of event.payload.options)
          if (option.title.length > 20) labels.add(`${option.id}:${option.title.length}`);
      }
    }
    return { ...result, screenId: screenId(session) };
  };
  const observe = (step: AssistanceStep, result: TurnResult & { screenId?: string }) =>
    result.screenId === step.id ||
    (['IDE-02', 'IDE-03'].includes(step.id) &&
      result.events.some(
        (event) => event.type === 'message.text' && event.payload.text === step.bot,
      ));
  const replay = async (path: Action[]) => {
    const session = `catalog-path-${++sequence}`;
    let result: (TurnResult & { screenId?: string }) | undefined;
    for (const [index, action] of path.entries()) {
      result = await send(session, action);
      const prefix = path.slice(0, index + 1);
      if (result.screenId) remember(result.screenId, prefix);
      for (const id of ['IDE-02', 'IDE-03']) {
        if (
          !result.events.some(
            (event) =>
              event.type === 'message.text' &&
              event.payload.text === assistanceCatalog.byId[id]!.bot,
          )
        )
          continue;
        if (result.screenId !== id) intermediate.add(id);
        remember(id, prefix);
      }
    }
    return result!;
  };
  const gate: Action[] = [
    { type: 'text', text: 'Quero ver meu contrato.' },
    { type: 'choice', id: 'IDE-08' },
    { type: 'flow', id: 'IDE-08', data: { cpf: '11111111111' } },
  ];
  const queue: Array<{ step: AssistanceStep; path: Action[] }> = [];
  // Exercise the actual CPF validation branch; the happy-path gate cannot
  // establish reachability of the invalid-format screen.
  queue.push({
    step: assistanceCatalog.byId['IDE-04']!,
    path: [
      { type: 'text', text: 'Quero ver meu contrato.' },
      { type: 'choice', id: 'IDE-08' },
      { type: 'flow', id: 'IDE-08', data: { cpf: '12345' } },
    ],
  });
  const textKey = (text: string) => text.trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
  const seededTexts = new Set<string>();
  for (const step of assistanceCatalog.steps) {
    if (!step.user || step.mode === 'audio' || seededTexts.has(textKey(step.user))) continue;
    // A shared phrase still has a legitimate first-match public entry. Seed it
    // once; later conditional variants require their actual service context.
    seededTexts.add(textKey(step.user));
    const path: Action[] = [...(step.requiresAuth ? gate : []), { type: 'text', text: step.user }];
    queue.push({ step, path });
  }
  for (const step of assistanceCatalog.steps.filter((item) => item.mode === 'audio')) {
    queue.push({
      step,
      path: [...(step.requiresAuth ? gate : []), { type: 'voice', mediaId: step.id }],
    });
  }
  while (queue.length) {
    const { step, path } = queue.shift()!;
    // The same review can be observed with either an incomplete draft or submitted fields.
    // Coverage is by ID; exploration must retain these distinct user contexts.
    const explorationKey = `${step.id}:dependent-context-${dependentContext(path)}`;
    if (explored.has(explorationKey)) continue;
    explored.add(explorationKey);
    let result = await replay(path);
    if (
      !observe(step, result) &&
      step.requiresAuth &&
      result.events.some(
        (event) =>
          event.type === 'message.text' &&
          event.payload.text === assistanceCatalog.byId['IDE-01']!.bot,
      )
    ) {
      path.push(
        { type: 'choice', id: 'IDE-08' },
        { type: 'flow', id: 'IDE-08', data: { cpf: '11111111111' } },
      );
      result = await replay(path);
    }
    if (!observe(step, result)) {
      failures.add(`${step.id}:entry/transition did not render expected state`);
      continue;
    }
    remember(step.id, path);
    failures.delete(`${step.id}:entry/transition did not render expected state`);
    // Shared intents must also be typed after entering their owning journey,
    // not only from a fresh session. Do not seed conditional outcomes here.
    for (const candidate of assistanceCatalog.steps) {
      if (
        candidate.journeyId !== step.journeyId ||
        textKey(candidate.user) !== 'quero confirmar.' ||
        candidate.alternative ||
        !candidate.user ||
        candidate.id === step.id ||
        candidate.mode === 'audio' ||
        assistanceCatalog.steps.filter((item) => textKey(item.user) === textKey(candidate.user))
          .length < 2
      )
        continue;
      queue.push({ step: candidate, path: [...path, { type: 'text', text: candidate.user }] });
    }
    if (result.screenId && result.screenId !== step.id && assistanceCatalog.byId[result.screenId]) {
      queue.push({ step: assistanceCatalog.byId[result.screenId]!, path });
    }
    const offered = result.events.flatMap((event) =>
      event.type === 'message.quick_replies' ? event.payload.options : [],
    );
    step.actions.forEach((action, index) => {
      const option = offered[index];
      if (!option || option.title !== action.label) {
        failures.add(`${step.id}:action ${index} not offered`);
        return;
      }
      const target = assistanceCatalog.byId[action.target];
      if (!target) {
        failures.add(`${step.id}->${action.target}:unknown target`);
        return;
      }
      queue.push({ step: target, path: [...path, { type: 'choice', id: option.id }] });
    });
    const flow = step.flow as
      | {
          choices?: Array<{ target: string }>;
          target?: string;
          correction?: string;
          fields?: Array<{ name: string; choices?: string[]; type?: string; required?: boolean }>;
          consent?: string;
        }
      | undefined;
    for (const [index, choice] of (flow?.choices ?? []).entries()) {
      const target = assistanceCatalog.byId[choice.target];
      if (target)
        queue.push({
          step: target,
          path: [...path, { type: 'flow', id: step.id, data: { choice: String(index) } }],
        });
      else failures.add(`${step.id}->${choice.target}:unknown target`);
    }
    if (flow?.target && !flow.choices && !flow.fields?.length) {
      const target = assistanceCatalog.byId[flow.target];
      if (target)
        queue.push({
          step: target,
          path: [
            ...path,
            { type: 'flow', id: step.id, data: flow.consent ? { consent: true } : {} },
          ],
        });
    }
    if (flow?.target && flow.fields?.length && formData[step.id]) {
      const target = assistanceCatalog.byId[flow.target];
      if (target)
        queue.push({
          step: target,
          path: [...path, { type: 'flow', id: step.id, data: formData[step.id]! }],
        });
    }
    if (flow?.correction) {
      const target = assistanceCatalog.byId[flow.correction];
      if (target)
        queue.push({
          step: target,
          path: [...path, { type: 'flow', id: step.id, data: { correction: true } }],
        });
    }
  }
  for (const step of assistanceCatalog.steps) {
    const path = paths.get(step.id);
    rows.push({
      id: step.id,
      ...(path
        ? {
            path: path.map((action) =>
              action.type === 'text'
                ? 'user.text'
                : action.type === 'voice'
                  ? `voice:${action.mediaId}`
                  : action.type === 'choice'
                    ? `choice:${action.id}`
                    : `submit:${action.id}`,
            ),
          }
        : {}),
      condition: path
        ? intermediate.has(step.id)
          ? 'intermediate CPF message actually emitted on HTTP path; no persistent-state inference'
          : 'screenId observed after real HTTP path; outgoing/action failures listed separately'
        : `${step.title}; ${
            assistanceCatalog.steps.some((source) => source.destinations.includes(step.id))
              ? 'declared incoming control exists; upstream emission/form/mutation path remains unverified'
              : 'no declared incoming control; entry/condition binding needed (unique utterance alone is not proof)'
          }`,
    });
  }
  return {
    rows,
    missing: rows.filter((row) => !row.path).map((row) => row.id),
    failures: [...failures],
    overlongEmittedLabels: [...labels],
  };
}
