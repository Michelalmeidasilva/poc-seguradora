import { err, ok, type Result } from '@seguradora/protocol';
import { z } from 'zod';

export type FlowIssue = { path: string; code: string; message: string };

export type FlowAction =
  | { name: 'navigate'; next: { type: 'screen'; name: string }; payload?: Record<string, unknown> }
  | { name: 'complete'; payload?: Record<string, unknown> }
  | { name: 'data_exchange'; payload?: Record<string, unknown> }
  | { name: 'open_url'; url: string }
  | { name: 'update_data'; payload?: Record<string, unknown> };

export type Option = { id: string; title: string; description?: string; enabled?: boolean };

type Field = { name: string; label?: string; required?: boolean; visible?: boolean };

export type TextComponent = {
  type: 'TextHeading' | 'TextSubheading' | 'TextBody' | 'TextCaption' | 'RichText';
  text?: string | string[];
  visible?: boolean;
};
export type InputComponent = Field & {
  type: 'TextInput' | 'TextArea' | 'DatePicker' | 'CalendarPicker';
  'input-type'?: string;
};
export type OptionsComponent = Field & {
  type: 'CheckboxGroup' | 'RadioButtonsGroup' | 'Dropdown' | 'ChipsSelector';
  'data-source': Option[];
};
export type OptInComponent = Field & { type: 'OptIn' };
export type PickerComponent = Field & { type: 'PhotoPicker' | 'DocumentPicker' };
export type FooterComponent = {
  type: 'Footer';
  label: string;
  enabled?: boolean;
  'on-click-action': FlowAction;
};
export type EmbeddedLinkComponent = {
  type: 'EmbeddedLink';
  text: string;
  'on-click-action': FlowAction;
};
export type ImageComponent = { type: 'Image'; src: string; 'alt-text'?: string };
export type NavigationListComponent = {
  type: 'NavigationList';
  name?: string;
  'list-items': { id: string; 'main-content': { title: string }; 'on-click-action'?: FlowAction }[];
};
export type ImageCarouselComponent = {
  type: 'ImageCarousel';
  images: { src: string; 'alt-text'?: string }[];
};
export type IfComponent = {
  type: 'If';
  condition: string;
  then: FlowComponent[];
  else?: FlowComponent[];
};
export type SwitchComponent = {
  type: 'Switch';
  value: string;
  cases: Record<string, FlowComponent[]>;
};
/** Anything the engine does not know: kept as-is, rendered as nothing. */
export type UnknownComponent = { type: string };

export type KnownComponent =
  | TextComponent
  | InputComponent
  | OptionsComponent
  | OptInComponent
  | PickerComponent
  | FooterComponent
  | EmbeddedLinkComponent
  | ImageComponent
  | NavigationListComponent
  | ImageCarouselComponent
  | IfComponent
  | SwitchComponent;
export type FlowComponent = KnownComponent | UnknownComponent;

export type FlowScreen = {
  id: string;
  title?: string;
  terminal?: boolean;
  success?: boolean;
  sensitive?: string[] | boolean;
  refresh_on_back?: boolean;
  data?: Record<string, unknown>;
  layout: { type: 'SingleColumnLayout'; children: FlowComponent[] };
};

export type FlowJson = {
  version: string;
  screens: FlowScreen[];
  routing_model?: Record<string, string[]>;
};

/** Narrows a component by its `type` (the unknown member keeps plain `narrowing` from working). */
export function isComponent<T extends KnownComponent['type']>(
  c: FlowComponent,
  type: T,
): c is Extract<KnownComponent, { type: T }> {
  return c.type === type;
}

export const MAX_FLOW_CHARS = 512 * 1024;
export const MAX_COMPONENTS_PER_SCREEN = 50;
export const MAX_NESTING = 3;
export const MAX_BRANCHES = 10;
export const RESERVED_SCREEN_ID = 'SUCCESS';

// Stub: Task 2 replaces this with the expression engine's own check.
const hasDynamicValue = (src: string): boolean => /\$\{(data|form)\./.test(src);

/** Own-property lookup: untrusted keys such as `constructor` must never hit the prototype. */
const own = <T>(table: Record<string, T>, key: string): T | undefined =>
  Object.hasOwn(table, key) ? table[key] : undefined;

const TEXT_LIMITS: Record<string, number> = {
  TextHeading: 80,
  TextSubheading: 80,
  TextCaption: 409,
  TextBody: 4096,
};
const OPTION_LIMITS: Record<string, [number, number]> = {
  CheckboxGroup: [1, 20],
  RadioButtonsGroup: [1, 200],
  Dropdown: [1, 200],
};
const TYPE_LIMITS: Record<string, { max: number; code: string }> = {
  EmbeddedLink: { max: 2, code: 'too_many_embedded_links' },
  Image: { max: 3, code: 'too_many_images' },
  OptIn: { max: 5, code: 'too_many_opt_ins' },
};
const payload = z.record(z.unknown()).optional();
const actionSchema = z.discriminatedUnion('name', [
  z
    .object({
      name: z.literal('navigate'),
      next: z.object({ type: z.literal('screen'), name: z.string().min(1) }).passthrough(),
      payload,
    })
    .passthrough(),
  z.object({ name: z.literal('complete'), payload }).passthrough(),
  z.object({ name: z.literal('data_exchange'), payload }).passthrough(),
  z.object({ name: z.literal('open_url'), url: z.string().min(1) }).passthrough(),
  z.object({ name: z.literal('update_data'), payload }).passthrough(),
]);

const str = z.string();
const option = z.object({ id: str, title: str }).passthrough();
const leaf = (extra: z.ZodRawShape) => z.object({ type: str, ...extra }).passthrough();
const field = { name: str.min(1) };
const COMPONENT_SHAPES: Record<string, z.ZodTypeAny> = {
  TextHeading: leaf({ text: str }),
  TextSubheading: leaf({ text: str }),
  TextBody: leaf({ text: str }),
  TextCaption: leaf({ text: str }),
  RichText: leaf({ text: z.union([str, z.array(str)]) }),
  TextInput: leaf({ ...field, label: str }),
  TextArea: leaf({ ...field, label: str }),
  DatePicker: leaf({ ...field, label: str }),
  CalendarPicker: leaf({ ...field }),
  CheckboxGroup: leaf({ ...field, 'data-source': z.array(option) }),
  RadioButtonsGroup: leaf({ ...field, 'data-source': z.array(option) }),
  Dropdown: leaf({ ...field, 'data-source': z.array(option) }),
  ChipsSelector: leaf({ ...field, 'data-source': z.array(option) }),
  OptIn: leaf({ ...field, label: str }),
  PhotoPicker: leaf({ ...field }),
  DocumentPicker: leaf({ ...field }),
  Footer: leaf({ label: str, 'on-click-action': z.record(z.unknown()) }),
  EmbeddedLink: leaf({ text: str, 'on-click-action': z.record(z.unknown()) }),
  Image: leaf({ src: str }),
  NavigationList: leaf({ 'list-items': z.array(z.object({ id: str }).passthrough()) }),
  ImageCarousel: leaf({ images: z.array(z.object({ src: str }).passthrough()) }),
  If: leaf({ condition: str }),
  Switch: leaf({ value: str }),
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

interface ScreenCtx {
  path: string;
  terminal: boolean;
  issues: FlowIssue[];
  leaves: number;
  perType: Map<string, number>;
  pickers: number;
  footerActions: FlowAction[];
  navTargets: Set<string>;
}

class Issues {
  readonly list: FlowIssue[] = [];
  add(path: string, code: string, message: string): void {
    this.list.push({ path, code, message });
  }
}

function checkAction(raw: unknown, path: string, issues: Issues): FlowAction | undefined {
  const r = actionSchema.safeParse(raw);
  if (!r.success) {
    issues.add(path, 'invalid_action', 'Ação inválida.');
    return undefined;
  }
  return r.data as FlowAction;
}

/** Collects every `on-*-action` of a known component (and NavigationList items). */
function collectActions(
  node: Record<string, unknown>,
  path: string,
  issues: Issues,
  into: FlowAction[],
): void {
  for (const key of Object.keys(node)) {
    if (/^on-.+-action$/.test(key)) {
      const a = checkAction(node[key], `${path}.${key}`, issues);
      if (a) into.push(a);
    }
  }
  const items = node['list-items'];
  if (node.type === 'NavigationList' && Array.isArray(items)) {
    items.forEach((item, i) => {
      if (isRecord(item) && item['on-click-action'] !== undefined) {
        const a = checkAction(
          item['on-click-action'],
          `${path}.list-items[${i}].on-click-action`,
          issues,
        );
        if (a) into.push(a);
      }
    });
  }
}

interface ListResult {
  /** Footers on the heaviest path through this list (If/Switch branches are alternatives). */
  footers: number;
  /** Footers inside If/Switch at this level. */
  nested: number;
}

function walkList(
  list: unknown,
  path: string,
  depth: number,
  ctx: ScreenCtx,
  issues: Issues,
): ListResult {
  if (!Array.isArray(list)) {
    issues.add(path, 'invalid_component', 'Esperava uma lista de componentes.');
    return { footers: 0, nested: 0 };
  }
  let direct = 0;
  let nested = 0;
  list.forEach((node, i) => {
    const p = `${path}[${i}]`;
    if (!isRecord(node) || typeof node.type !== 'string') {
      issues.add(p, 'invalid_component', 'Componente sem "type".');
      return;
    }
    const type = node.type;
    const shape = own(COMPONENT_SHAPES, type);
    if (shape) {
      const r = shape.safeParse(node);
      if (!r.success) {
        const first = r.error.issues[0];
        const sub = first ? first.path.join('.') : '';
        issues.add(sub ? `${p}.${sub}` : p, 'invalid_component', `Componente ${type} inválido.`);
        return;
      }
    }
    if (type === 'If' || type === 'Switch') {
      if (depth + 1 > MAX_NESTING) {
        issues.add(p, 'nesting_too_deep', `If/Switch aninhados além de ${MAX_NESTING} níveis.`);
        return;
      }
      nested += walkStructural(node, p, depth + 1, ctx, issues);
      return;
    }
    ctx.leaves += 1;
    ctx.perType.set(type, (ctx.perType.get(type) ?? 0) + 1);
    const textLimit = own(TEXT_LIMITS, type);
    if (type === 'Footer') direct += 1;
    if (type === 'PhotoPicker' || type === 'DocumentPicker') ctx.pickers += 1;
    if (textLimit !== undefined && typeof node.text === 'string' && node.text.length > textLimit) {
      issues.add(`${p}.text`, 'text_too_long', `${type} aceita até ${textLimit} caracteres.`);
    }
    const limits = own(OPTION_LIMITS, type);
    const source = node['data-source'];
    if (
      limits &&
      Array.isArray(source) &&
      (source.length < limits[0] || source.length > limits[1])
    ) {
      issues.add(
        `${p}.data-source`,
        'invalid_option_count',
        `${type} aceita ${limits[0]} a ${limits[1]} opções.`,
      );
    }
    if (shape) {
      const actions: FlowAction[] = [];
      collectActions(node, p, issues, actions);
      for (const a of actions) {
        if (a.name === 'navigate') ctx.navTargets.add(a.next.name);
        if (type === 'Footer') ctx.footerActions.push(a);
      }
    }
  });
  if (direct > 0 && nested > 0) {
    issues.add(path, 'footer_outside_if', 'Footer fora do If/Switch que já define um Footer.');
  }
  return { footers: direct + nested, nested };
}

/** Walks an If/Switch; returns the Footers on its heaviest branch. */
function walkStructural(
  node: Record<string, unknown>,
  path: string,
  depth: number,
  ctx: ScreenCtx,
  issues: Issues,
): number {
  const branches: { path: string; list: unknown }[] = [];
  if (node.type === 'If') {
    if (!hasDynamicValue(node.condition as string)) {
      issues.add(
        `${path}.condition`,
        'condition_not_dynamic',
        'A condição precisa de ${data.*} ou ${form.*}.',
      );
    }
    branches.push({ path: `${path}.then`, list: node.then });
    if (node.else !== undefined) branches.push({ path: `${path}.else`, list: node.else });
    else branches.push({ path: `${path}.else`, list: [] });
  } else {
    if (!hasDynamicValue(node.value as string)) {
      issues.add(
        `${path}.value`,
        'condition_not_dynamic',
        'O valor precisa de ${data.*} ou ${form.*}.',
      );
    }
    if (!isRecord(node.cases)) {
      issues.add(`${path}.cases`, 'invalid_component', 'Switch sem "cases".');
      return 0;
    }
    for (const [k, list] of Object.entries(node.cases)) {
      branches.push({ path: `${path}.cases.${k}`, list });
    }
  }
  const counts = branches.map((b) => walkList(b.list, b.path, depth, ctx, issues).footers);
  const withFooter = counts.filter((c) => c > 0).length;
  if (withFooter > 0 && withFooter < counts.length) {
    const code = node.type === 'If' ? 'if_footer_mismatch' : 'switch_footer_mismatch';
    issues.add(path, code, 'Se um ramo tem Footer, todos os ramos devem ter.');
  }
  return Math.max(0, ...counts);
}

function validateScreen(screen: Record<string, unknown>, index: number, issues: Issues) {
  const path = `screens[${index}]`;
  const layout = screen.layout;
  const children = isRecord(layout) ? layout.children : undefined;
  const ctx: ScreenCtx = {
    path,
    terminal: screen.terminal === true,
    issues: issues.list,
    leaves: 0,
    perType: new Map(),
    pickers: 0,
    footerActions: [],
    navTargets: new Set(),
  };
  if (!Array.isArray(children)) {
    issues.add(`${path}.layout.children`, 'invalid_layout', 'A tela precisa de layout.children.');
    return ctx;
  }
  const total = walkList(children, `${path}.layout.children`, 0, ctx, issues);
  if (ctx.leaves > MAX_COMPONENTS_PER_SCREEN) {
    issues.add(
      path,
      'too_many_components',
      `Uma tela aceita até ${MAX_COMPONENTS_PER_SCREEN} componentes.`,
    );
  }
  if (total.footers > 1) issues.add(path, 'too_many_footers', 'Uma tela aceita um Footer.');
  for (const [type, { max, code }] of Object.entries(TYPE_LIMITS)) {
    if ((ctx.perType.get(type) ?? 0) > max)
      issues.add(path, code, `Máximo de ${max} ${type} por tela.`);
  }
  if (ctx.pickers > 1) {
    issues.add(path, 'too_many_pickers', 'Um PhotoPicker ou DocumentPicker por tela.');
  }
  if (ctx.terminal) {
    if (total.footers === 0) {
      issues.add(path, 'terminal_requires_footer', 'Tela terminal exige Footer.');
    }
    if (ctx.footerActions.some((a) => a.name === 'navigate')) {
      issues.add(path, 'navigate_in_terminal', 'Footer de tela terminal não pode usar navigate.');
    }
  }
  return ctx;
}

/** Cycle, entry and reachability checks. Iterative: no recursion depth risk. */
function checkGraph(
  ids: string[],
  terminal: Set<string>,
  edges: Map<string, string[]>,
  issues: Issues,
): void {
  const incoming = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const targets of edges.values()) {
    for (const t of targets) incoming.set(t, (incoming.get(t) ?? 0) + 1);
  }
  const entry = ids.find((id) => incoming.get(id) === 0);
  if (entry === undefined) {
    issues.add(
      'routing_model',
      'no_entry_screen',
      'Nenhuma tela de entrada (sem arestas de entrada).',
    );
  }

  // 0 = unvisited, 1 = on stack, 2 = done
  const state = new Map<string, number>();
  let cyclic = false;
  for (const root of ids) {
    if (state.get(root)) continue;
    const stack: { id: string; next: number }[] = [{ id: root, next: 0 }];
    state.set(root, 1);
    while (stack.length > 0 && !cyclic) {
      const top = stack[stack.length - 1]!;
      const targets = edges.get(top.id) ?? [];
      if (top.next >= targets.length) {
        state.set(top.id, 2);
        stack.pop();
        continue;
      }
      const to = targets[top.next++]!;
      const s = state.get(to) ?? 0;
      if (s === 1) cyclic = true;
      else if (s === 0) {
        state.set(to, 1);
        stack.push({ id: to, next: 0 });
      }
    }
    if (cyclic) break;
  }
  if (cyclic) issues.add('routing_model', 'routing_cycle', 'O roteamento tem um ciclo.');

  if (entry !== undefined) {
    const seen = new Set<string>([entry]);
    const queue = [entry];
    while (queue.length > 0) {
      const id = queue.pop()!;
      for (const t of edges.get(id) ?? []) {
        if (!seen.has(t)) {
          seen.add(t);
          queue.push(t);
        }
      }
    }
    for (const id of ids) {
      if (!seen.has(id))
        issues.add(`screens.${id}`, 'unreachable_screen', `Tela ${id} inalcançável.`);
    }
  }
  for (const id of ids) {
    if (!terminal.has(id) && (edges.get(id) ?? []).length === 0) {
      issues.add(`screens.${id}`, 'dead_end', `Tela ${id} não é terminal e não tem destino.`);
    }
  }
}

export function parseFlow(raw: unknown): Result<FlowJson, FlowIssue[]> {
  if (!isRecord(raw)) {
    return err([
      { path: '', code: 'not_an_object', message: 'O Flow precisa ser um objeto JSON.' },
    ]);
  }
  let size: number;
  try {
    size = JSON.stringify(raw).length;
  } catch {
    return err([{ path: '', code: 'not_serializable', message: 'O Flow não é JSON válido.' }]);
  }
  if (size > MAX_FLOW_CHARS) {
    return err([{ path: '', code: 'too_large', message: 'O Flow excede 512 KB.' }]);
  }

  const issues = new Issues();
  if (typeof raw.version !== 'string' || raw.version === '') {
    issues.add('version', 'version_required', 'O Flow precisa de "version".');
  }
  const screens = raw.screens;
  if (!Array.isArray(screens) || screens.length === 0) {
    issues.add('screens', 'screens_required', 'O Flow precisa de ao menos uma tela.');
    return err(issues.list);
  }

  const ids: string[] = [];
  const known = new Set<string>();
  const terminal = new Set<string>();
  const derived = new Map<string, string[]>();
  screens.forEach((s, i) => {
    if (!isRecord(s) || typeof s.id !== 'string' || s.id === '') {
      issues.add(`screens[${i}].id`, 'invalid_screen', 'Tela sem "id".');
      return;
    }
    if (s.id === RESERVED_SCREEN_ID) {
      issues.add(`screens[${i}].id`, 'reserved_screen_id', 'O id SUCCESS é reservado.');
    }
    if (known.has(s.id))
      issues.add(`screens[${i}].id`, 'duplicate_screen_id', `Tela ${s.id} duplicada.`);
    else {
      known.add(s.id);
      ids.push(s.id);
    }
    if (s.terminal === true) terminal.add(s.id);
    const ctx = validateScreen(s, i, issues);
    derived.set(s.id, [...ctx.navTargets]);
  });

  for (const [from, targets] of derived) {
    for (const t of targets) {
      if (!known.has(t))
        issues.add(`screens.${from}`, 'unknown_screen', `Destino ${t} não existe.`);
    }
  }

  let edges = new Map<string, string[]>();
  const model = raw.routing_model;
  if (model === undefined) {
    for (const [from, targets] of derived)
      edges.set(
        from,
        targets.filter((t) => known.has(t)),
      );
  } else if (!isRecord(model)) {
    issues.add('routing_model', 'invalid_routing_model', 'routing_model precisa ser um objeto.');
  } else {
    edges = new Map();
    for (const [from, targets] of Object.entries(model)) {
      const p = `routing_model.${from}`;
      if (!known.has(from)) issues.add(p, 'unknown_screen', `Tela ${from} não existe.`);
      if (!Array.isArray(targets) || targets.some((t) => typeof t !== 'string')) {
        issues.add(p, 'invalid_routing_model', 'Destinos precisam ser uma lista de ids.');
        continue;
      }
      if (targets.length > MAX_BRANCHES) {
        issues.add(p, 'too_many_branches', `No máximo ${MAX_BRANCHES} destinos por tela.`);
      }
      for (const t of targets as string[]) {
        if (!known.has(t)) issues.add(p, 'unknown_screen', `Destino ${t} não existe.`);
      }
      edges.set(
        from,
        [...new Set(targets as string[])].filter((t) => known.has(t)),
      );
    }
  }

  if (issues.list.length === 0 || model === undefined || isRecord(model)) {
    checkGraph(ids, terminal, edges, issues);
  }
  if (issues.list.length > 0) return err(issues.list);
  return ok(raw as unknown as FlowJson);
}

/** First screen with no incoming edge, else the first screen (a validated flow always has one). */
export function entryScreen(flow: FlowJson): FlowScreen {
  const edges = new Map<string, string[]>();
  if (flow.routing_model) {
    for (const [k, v] of Object.entries(flow.routing_model)) edges.set(k, v);
  } else {
    for (const s of flow.screens) {
      const targets: string[] = [];
      collectNavTargets(s.layout.children, targets, 0);
      edges.set(s.id, targets);
    }
  }
  const hasIncoming = new Set<string>();
  for (const targets of edges.values()) for (const t of targets) hasIncoming.add(t);
  return flow.screens.find((s) => !hasIncoming.has(s.id)) ?? flow.screens[0]!;
}

function collectNavTargets(list: FlowComponent[], into: string[], depth: number): void {
  if (depth > MAX_NESTING) return;
  for (const c of list) {
    if (isComponent(c, 'If')) {
      collectNavTargets(c.then, into, depth + 1);
      collectNavTargets(c.else ?? [], into, depth + 1);
    } else if (isComponent(c, 'Switch')) {
      for (const l of Object.values(c.cases)) collectNavTargets(l, into, depth + 1);
    } else {
      for (const [k, v] of Object.entries(c)) {
        if (/^on-.+-action$/.test(k) && isRecord(v) && v.name === 'navigate') {
          const next = v.next;
          if (isRecord(next) && typeof next.name === 'string') into.push(next.name);
        }
      }
      if (isComponent(c, 'NavigationList')) {
        for (const item of c['list-items']) {
          const a = item['on-click-action'];
          if (a?.name === 'navigate') into.push(a.next.name);
        }
      }
    }
  }
}

export function screenById(flow: FlowJson, id: string): FlowScreen | undefined {
  return flow.screens.find((s) => s.id === id);
}
