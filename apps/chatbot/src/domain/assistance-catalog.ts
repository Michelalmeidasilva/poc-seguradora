import generated from './assistance-catalog.generated.json';

export type AssistanceMode = 'chat' | 'list' | 'form' | 'review' | 'audio' | 'document';

export interface AssistanceAction {
  label: string;
  target: string;
}

export interface AssistanceStep {
  id: string;
  journeyId: string;
  title: string;
  user: string;
  bot: string;
  mode: AssistanceMode;
  requiresAuth: boolean;
  actions: AssistanceAction[];
  destinations: string[];
  [content: string]: unknown;
}

interface GeneratedGroup {
  id: string;
  title: string;
  steps: Array<Record<string, unknown>>;
}

const groups = (generated.groups as GeneratedGroup[]).map((group) => ({
  ...group,
  steps: group.steps.map((raw) => {
    const step = raw as Record<string, unknown>;
    const actions = (step.actions as AssistanceAction[] | undefined) ?? [];
    const targets = new Set<string>();
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
          if (key === 'target' && typeof child === 'string') targets.add(child);
          else visit(child);
        }
      }
    };
    visit(step);
    return { ...step, actions, destinations: [...targets] } as unknown as AssistanceStep;
  }),
}));

const steps = groups.flatMap((group) => group.steps);
const byId = Object.fromEntries(steps.map((step) => [step.id, step])) as Record<string, AssistanceStep>;

export const assistanceCatalog = {
  version: generated.version,
  groups,
  steps,
  ids: steps.map((step) => step.id),
  byId,
} as const;
