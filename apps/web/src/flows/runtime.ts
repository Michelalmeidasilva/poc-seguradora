import { evalCondition, hasDynamicValue, interpolate, resolveValue, type Scope } from './expr';
import {
  entryScreen,
  type FlowComponent,
  type FlowJson,
  type FlowScreen,
  MAX_NESTING,
  screenById,
} from './schema';
import { validateField } from './validation';

export interface RuntimeState {
  /** Last frame is the current screen; `data` is the payload of the last navigation into it. */
  stack: { screenId: string; data: Record<string, unknown> }[];
  /** Every field by name, across screens; kept on Back. */
  form: Record<string, unknown>;
  touched: Record<string, true>;
  /** `exchange` while a data_exchange is in flight. */
  pending: 'idle' | 'exchange';
  outcome?: { kind: 'complete'; payload: Record<string, unknown> };
  /** Set by the first user `set`; `init-value` seeding (`source: 'init'`) leaves it unset. */
  edited?: true;
  /**
   * Per component name, the current-screen `data` values that a select `update_data` replaced
   * (`had: false` = the key did not exist). Cleared on navigate and back.
   */
  undo?: Map<string, UndoEntry[]>;
}

export type UndoEntry = { key: string; had: boolean; value: unknown };

/** `record` keeps the values a select patch replaces; `restore` puts them back (unselect). */
export type UndoMode = { name: string; mode: 'record' | 'restore' };

/**
 * `navigate.payload`, `complete.payload` and `update_data.patch` are the RAW action values from
 * the Flow JSON, never pre-resolved: the reducer resolves them exactly once, via
 * `resolvePayload`. To get the value for the host (submit, data_exchange), call
 * `resolvePayload(flow, state, raw)` yourself; do not dispatch its result.
 */
export type RuntimeEvent =
  /** `source: 'init'` = init-value seeding, which does not count as a user edit. */
  | { type: 'set'; name: string; value: unknown; source?: 'init' }
  | { type: 'touch'; name: string }
  | { type: 'back' }
  | { type: 'navigate'; screenId: string; payload: Record<string, unknown> }
  | { type: 'complete'; payload: Record<string, unknown> }
  | { type: 'exchange_start' }
  | { type: 'exchange_done' }
  | { type: 'update_data'; patch: Record<string, unknown>; undo?: UndoMode };

const FIELD_TYPES = new Set([
  'TextInput',
  'TextArea',
  'DatePicker',
  'CalendarPicker',
  'CheckboxGroup',
  'RadioButtonsGroup',
  'Dropdown',
  'ChipsSelector',
  'OptIn',
  'PhotoPicker',
  'DocumentPicker',
]);

const EXACT_FORM_REF = /^\$\{form\.([A-Za-z_]\w*)(?:\.[A-Za-z_]\w*)*\}$/;
const FORM_REF = /\$\{form\.([A-Za-z_]\w*)/g;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const own = (table: Record<string, unknown>, key: string): unknown =>
  Object.hasOwn(table, key) ? table[key] : undefined;

const fieldName = (c: FlowComponent): string | undefined => {
  const name = own(c as Record<string, unknown>, 'name');
  return FIELD_TYPES.has(c.type) && typeof name === 'string' ? name : undefined;
};

const children = (screen: FlowScreen): unknown =>
  isRecord(screen) && isRecord(screen.layout) ? screen.layout.children : undefined;

export function initRuntime(
  flow: FlowJson,
  data: Record<string, unknown> = {},
  initialForm: Record<string, unknown> = {},
): RuntimeState {
  return {
    stack: [{ screenId: entryScreen(flow).id, data: isRecord(data) ? { ...data } : {} }],
    form: isRecord(initialForm) ? { ...initialForm } : {},
    touched: {},
    pending: 'idle',
  };
}

export function currentScreen(flow: FlowJson, s: RuntimeState): FlowScreen {
  const top = s.stack[s.stack.length - 1];
  return (top && screenById(flow, top.screenId)) ?? entryScreen(flow);
}

export function scopeOf(s: RuntimeState): Scope {
  return { data: s.stack[s.stack.length - 1]?.data ?? {}, form: s.form };
}

const isVisible = (c: FlowComponent, scope: Scope): boolean => {
  const v = own(c as Record<string, unknown>, 'visible');
  if (typeof v !== 'string') return v !== false;
  // A bound `visible` shows the component only when it resolves truthy.
  const r = resolveValue(v, scope);
  return Boolean(r) && r !== 'false';
};

/** A visible leaf and its structural path in the screen (stable while siblings toggle). */
export interface VisibleEntry {
  component: FlowComponent;
  path: string;
}

function walkVisible(
  list: unknown,
  scope: Scope,
  depth: number,
  path: string,
  out: VisibleEntry[],
): void {
  if (!Array.isArray(list) || depth > MAX_NESTING) return;
  (list as unknown[]).forEach((c, i) => {
    if (!isRecord(c) || typeof c.type !== 'string') return;
    const at = `${path}[${i}]`;
    if (c.type === 'If') {
      const r = evalCondition(c.condition as string, scope);
      const branch = r.ok && r.value ? 'then' : 'else';
      walkVisible(c[branch], scope, depth + 1, `${at}.${branch}`, out);
    } else if (c.type === 'Switch') {
      const key = interpolate(c.value as string, scope);
      if (isRecord(c.cases) && Object.hasOwn(c.cases, key)) {
        walkVisible(c.cases[key], scope, depth + 1, `${at}.cases.${key}`, out);
      }
    } else if (isVisible(c as FlowComponent, scope)) {
      out.push({ component: c as FlowComponent, path: at });
    }
  });
}

/** Visible leaves with their structural path (`children[1].then[0]`), for React keys. */
export function visibleEntries(screen: FlowScreen, scope: Scope): VisibleEntry[] {
  const out: VisibleEntry[] = [];
  walkVisible(children(screen), scope, 0, 'children', out);
  return out;
}

/** Leaves of the screen as shown now: If/Switch flattened, `visible: false` dropped. */
export function visibleComponents(screen: FlowScreen, scope: Scope): FlowComponent[] {
  return visibleEntries(screen, scope).map((e) => e.component);
}

/** Field names on every branch, visible or not. */
function walkDeclared(list: unknown, depth: number, into: Set<string>): void {
  if (!Array.isArray(list) || depth > MAX_NESTING) return;
  for (const c of list as unknown[]) {
    if (!isRecord(c) || typeof c.type !== 'string') continue;
    if (c.type === 'If') {
      walkDeclared(c.then, depth + 1, into);
      walkDeclared(c.else, depth + 1, into);
    } else if (c.type === 'Switch') {
      if (isRecord(c.cases))
        for (const l of Object.values(c.cases)) walkDeclared(l, depth + 1, into);
    } else {
      const name = fieldName(c as FlowComponent);
      if (name !== undefined) into.add(name);
    }
  }
}

const visibleFieldNames = (screen: FlowScreen, scope: Scope): Set<string> => {
  const names = new Set<string>();
  for (const c of visibleComponents(screen, scope)) {
    const name = fieldName(c);
    if (name !== undefined) names.add(name);
  }
  return names;
};

/**
 * Field names that may be submitted: visible on some frame of the stack, each frame evaluated
 * with its own `data` and the current `form`. Everything else known to the stack or `form` is
 * hidden (an unchosen branch, a stale value from a branch left behind).
 */
const fieldVisibility = (flow: FlowJson, s: RuntimeState) => {
  const submittable = new Set<string>();
  const known = new Set<string>(Object.keys(s.form));
  for (const frame of s.stack) {
    const screen = screenById(flow, frame.screenId);
    if (!screen) continue;
    walkDeclared(children(screen), 0, known);
    for (const n of visibleFieldNames(screen, { data: frame.data, form: s.form })) {
      submittable.add(n);
    }
  }
  const hidden = new Set([...known].filter((n) => !submittable.has(n)));
  return { submittable, hidden };
};

/**
 * The single place where action payloads are resolved: `reduce` uses it for `navigate`,
 * `complete` and `update_data`, and callers use it for the value they hand to the host (for
 * example a `data_exchange` payload). Always pass the RAW action payload from the Flow JSON;
 * passing an already resolved one would expand `${...}` text typed by the user.
 *
 * Hidden fields are not submitted: a key whose raw value is exactly `${form.hidden}` is
 * dropped, other references to a hidden field see null / "". Missing values never render
 * as "undefined".
 */
export function resolvePayload(
  flow: FlowJson,
  s: RuntimeState,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (!isRecord(payload)) return {};
  const { submittable, hidden } = fieldVisibility(flow, s);
  const form = Object.fromEntries(Object.entries(s.form).filter(([k]) => submittable.has(k)));
  const kept = Object.fromEntries(
    Object.entries(payload).filter(([, raw]) => {
      const m = typeof raw === 'string' ? EXACT_FORM_REF.exec(raw) : null;
      return !(m && hidden.has(m[1] as string));
    }),
  );
  const resolved = resolveValue(kept, { data: scopeOf(s).data, form });
  return isRecord(resolved) ? resolved : {};
}

function restore(data: Record<string, unknown>, prev: UndoEntry[]): Record<string, unknown> {
  const out = { ...data };
  for (const p of prev) {
    if (p.had)
      Object.defineProperty(out, p.key, {
        value: p.value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    else delete out[p.key];
  }
  return out;
}

const withoutUndo = (s: RuntimeState): RuntimeState => {
  if (!s.undo) return s;
  const next = { ...s };
  delete next.undo;
  return next;
};

function step(flow: FlowJson, s: RuntimeState, e: RuntimeEvent): RuntimeState {
  if (s.outcome || !isRecord(e)) return s;
  switch (e.type) {
    case 'set':
    case 'touch': {
      if (typeof e.name !== 'string') return s;
      if (!visibleFieldNames(currentScreen(flow, s), scopeOf(s)).has(e.name)) return s;
      if (e.type === 'set') {
        const form = { ...s.form, [e.name]: e.value };
        if (
          e.source !== 'init' &&
          flow.resetConsentOnEdit?.includes(e.name) &&
          s.form[e.name] !== e.value
        ) {
          form.consent = false;
        }
        const next = { ...s, form };
        return e.source === 'init' || s.edited ? next : { ...next, edited: true as const };
      }
      if (Object.hasOwn(s.touched, e.name)) return s;
      return { ...s, touched: { ...s.touched, [e.name]: true } };
    }
    case 'back':
      if (s.pending === 'exchange' || s.stack.length <= 1) return s;
      return withoutUndo({ ...s, stack: s.stack.slice(0, -1) });
    case 'navigate': {
      if (typeof e.screenId !== 'string' || !screenById(flow, e.screenId)) return s;
      if (s.stack[s.stack.length - 1]?.screenId === e.screenId) return s;
      const data = resolvePayload(flow, s, e.payload);
      return withoutUndo({ ...s, stack: [...s.stack, { screenId: e.screenId, data }] });
    }
    case 'complete':
      return {
        ...s,
        pending: 'idle',
        outcome: { kind: 'complete', payload: resolvePayload(flow, s, e.payload) },
      };
    case 'exchange_start':
      return s.pending === 'exchange' ? s : { ...s, pending: 'exchange' };
    case 'exchange_done':
      return s.pending === 'idle' ? s : { ...s, pending: 'idle' };
    case 'update_data': {
      const top = s.stack[s.stack.length - 1];
      if (!top || !isRecord(e.patch)) return s;
      const patch = resolvePayload(flow, s, e.patch);
      let base = top.data;
      let undo = s.undo;
      const u = isRecord(e.undo) && typeof e.undo.name === 'string' ? e.undo : undefined;
      if (u?.mode === 'record' && !undo?.has(u.name)) {
        const prev = Object.keys(patch).map((key) =>
          Object.hasOwn(base, key)
            ? { key, had: true, value: base[key] }
            : { key, had: false, value: undefined },
        );
        undo = new Map(undo).set(u.name, prev);
      } else if (u?.mode === 'restore' && undo?.has(u.name)) {
        base = restore(base, undo.get(u.name) ?? []);
        undo = new Map(undo);
        undo.delete(u.name);
      }
      const data = { ...base, ...patch };
      const next = { ...s, stack: [...s.stack.slice(0, -1), { ...top, data }] };
      return undo === s.undo ? next : { ...next, undo };
    }
    default:
      return s;
  }
}

/** Pure and total: an event that does not apply returns the same state object. */
export function reduce(flow: FlowJson, s: RuntimeState, e: RuntimeEvent): RuntimeState {
  try {
    return step(flow, s, e);
  } catch {
    return s;
  }
}

/** Errors of the visible fields of the current screen, by field name. */
export function screenErrors(flow: FlowJson, s: RuntimeState): Record<string, string> {
  const scope = scopeOf(s);
  const errors = new Map<string, string>();
  for (const c of visibleComponents(currentScreen(flow, s), scope)) {
    const name = fieldName(c);
    if (name === undefined || errors.has(name)) continue;
    const msg = own(c as Record<string, unknown>, 'error-message');
    const resolved =
      typeof msg === 'string' && hasDynamicValue(msg) ? interpolate(msg, scope) : msg;
    const override = { 'error-message': resolved };
    const comp: FlowComponent = resolved === msg ? c : { ...c, ...override };
    const error = validateField(comp, own(s.form, name));
    if (error !== undefined) errors.set(name, error);
  }
  return Object.fromEntries(errors);
}

export function footerDisabled(flow: FlowJson, s: RuntimeState): boolean {
  if (s.outcome || s.pending === 'exchange') return true;
  const scope = scopeOf(s);
  const footer = visibleComponents(currentScreen(flow, s), scope).find((c) => c.type === 'Footer');
  const enabled = footer ? own(footer as Record<string, unknown>, 'enabled') : undefined;
  if (resolveValue(enabled, scope) === false) return true;
  return Object.keys(screenErrors(flow, s)).length > 0;
}

/** `${form.x}` names that no screen declares as a field (would always resolve to null). */
export function unknownFormRefs(flow: FlowJson): string[] {
  const declared = new Set<string>();
  const refs = new Set<string>();
  for (const screen of flow.screens) {
    walkDeclared(children(screen), 0, declared);
    let text: string;
    try {
      text = JSON.stringify(screen);
    } catch {
      continue;
    }
    for (const m of text.matchAll(FORM_REF)) refs.add(m[1] as string);
  }
  return [...refs].filter((n) => !declared.has(n));
}
