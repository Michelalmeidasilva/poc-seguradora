import { safeHttpUrl } from '../renderers/safe-urls';
import { hasDynamicValue } from './expr';
import { currentScreen, resolvePayload, type RuntimeEvent, type RuntimeState } from './runtime';
import { type FlowAction, type FlowJson, MAX_NESTING } from './schema';

/** What the Flow sheet needs from its caller; implemented outside flows/. */
export interface FlowHost {
  submit(flowId: string, data: Record<string, unknown>, summary: string): void;
  exchange(flowId: string, screen: string, action: string, data: Record<string, unknown>): void;
  openUrl(url: string): void;
  close(): void;
}

/** The component event that ran an action (ChipsSelector select / unselect). */
export interface ActionOrigin {
  name: string;
  event: 'select' | 'unselect';
}

export interface ActionContext {
  flow: FlowJson;
  flowId: string;
  /** The state at call time (backed by a ref), never a render closure. */
  getState(): RuntimeState;
  dispatch(event: RuntimeEvent): void;
  host: FlowHost;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const own = (table: Record<string, unknown>, key: string): unknown =>
  Object.hasOwn(table, key) ? table[key] : undefined;

const rawPayload = (a: Record<string, unknown>): Record<string, unknown> => {
  const p = own(a, 'payload');
  return isRecord(p) ? p : {};
};

const nextScreen = (a: Record<string, unknown>): string | undefined => {
  const next = own(a, 'next');
  if (!isRecord(next) || next.type !== 'screen') return undefined;
  return typeof next.name === 'string' ? next.name : undefined;
};

/** Completes once: a second call (double click) finds `outcome` set and does nothing. */
function complete(raw: Record<string, unknown>, ctx: ActionContext): void {
  const before = ctx.getState();
  if (before.outcome) return;
  const payload = resolvePayload(ctx.flow, before, raw);
  ctx.dispatch({ type: 'complete', payload: raw });
  if (!ctx.getState().outcome) return;
  ctx.host.submit(ctx.flowId, payload, buildSummary(ctx.flow, payload, before.form));
  ctx.host.close();
}

export function runAction(action: FlowAction, ctx: ActionContext, origin?: ActionOrigin): void {
  const a = action as unknown as Record<string, unknown>;
  if (!isRecord(a)) return;
  const state = ctx.getState();
  if (state.outcome) return;
  switch (a.name) {
    case 'navigate': {
      const screenId = nextScreen(a);
      if (screenId !== undefined) {
        ctx.dispatch({ type: 'navigate', screenId, payload: rawPayload(a) });
      }
      return;
    }
    case 'complete':
      complete(rawPayload(a), ctx);
      return;
    case 'data_exchange': {
      if (state.pending === 'exchange') return;
      const raw = rawPayload(a);
      const screen = currentScreen(ctx.flow, state);
      // Optimistic: the chatbot answers nothing yet, so the next step is decided locally.
      ctx.dispatch({ type: 'exchange_start' });
      ctx.host.exchange(
        ctx.flowId,
        screen.id,
        'data_exchange',
        resolvePayload(ctx.flow, state, raw),
      );
      ctx.dispatch({ type: 'exchange_done' });
      const screenId = nextScreen(a);
      if (screen.terminal === true) complete(raw, ctx);
      else if (screenId !== undefined) ctx.dispatch({ type: 'navigate', screenId, payload: raw });
      return;
    }
    case 'open_url': {
      const url = typeof a.url === 'string' ? safeHttpUrl(a.url) : undefined;
      if (url === undefined) {
        console.warn('[flows] open_url dropped: unsafe or invalid URL');
        return;
      }
      ctx.host.openUrl(url);
      return;
    }
    case 'update_data': {
      const patch = rawPayload(a);
      if (origin && typeof origin.name === 'string' && origin.name !== '') {
        const mode = origin.event === 'unselect' ? 'restore' : 'record';
        ctx.dispatch({ type: 'update_data', patch, undo: { name: origin.name, mode } });
      } else {
        ctx.dispatch({ type: 'update_data', patch });
      }
      return;
    }
    default:
      return;
  }
}

// ---- summary ---------------------------------------------------------------------------

const MASK = '••••';
const MAX_SUMMARY = 500;
const EMPTY_SUMMARY = 'Formulário enviado';

interface FieldInfo {
  label?: string;
  sensitive: boolean;
  /** Option id -> title, when the field has a static data-source. */
  titles?: Map<string, string>;
}

function collectFields(
  list: unknown,
  screenSensitive: true | Set<string>,
  depth: number,
  into: Map<string, FieldInfo>,
): void {
  if (!Array.isArray(list) || depth > MAX_NESTING) return;
  for (const c of list as unknown[]) {
    if (!isRecord(c) || typeof c.type !== 'string') continue;
    if (c.type === 'If') {
      collectFields(c.then, screenSensitive, depth + 1, into);
      collectFields(c.else, screenSensitive, depth + 1, into);
      continue;
    }
    if (c.type === 'Switch') {
      if (isRecord(c.cases)) {
        for (const l of Object.values(c.cases)) collectFields(l, screenSensitive, depth + 1, into);
      }
      continue;
    }
    const name = own(c, 'name');
    if (typeof name !== 'string' || name === '') continue;
    const sensitive =
      own(c, 'sensitive') === true || screenSensitive === true || screenSensitive.has(name);
    const prev = into.get(name);
    const label = own(c, 'label');
    const source = own(c, 'data-source');
    let titles: Map<string, string> | undefined;
    if (Array.isArray(source)) {
      titles = new Map();
      for (const o of source as unknown[]) {
        if (isRecord(o) && typeof o.id === 'string' && typeof o.title === 'string') {
          titles.set(o.id, o.title);
        }
      }
    }
    into.set(name, {
      label:
        prev?.label ??
        (typeof label === 'string' && label !== '' && !hasDynamicValue(label) ? label : undefined),
      // any sensitive declaration of the name wins
      sensitive: (prev?.sensitive ?? false) || sensitive,
      titles: prev?.titles ?? titles,
    });
  }
}

function fieldsOf(flow: FlowJson): Map<string, FieldInfo> {
  const fields = new Map<string, FieldInfo>();
  for (const screen of Array.isArray(flow.screens) ? flow.screens : []) {
    if (!isRecord(screen)) continue;
    const s = own(screen, 'sensitive');
    const screenSensitive =
      s === true
        ? true
        : new Set(Array.isArray(s) ? s.filter((n): n is string => typeof n === 'string') : []);
    const layout = own(screen, 'layout');
    collectFields(isRecord(layout) ? layout.children : undefined, screenSensitive, 0, fields);
  }
  return fields;
}

const oneLine = (v: string): string => v.replace(/\s+/g, ' ').trim();

function formatItem(v: unknown, titles: Map<string, string> | undefined): string {
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'string') return oneLine(titles?.get(v) ?? v);
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (isRecord(v)) {
    const file = own(v, 'file_name');
    return typeof file === 'string' ? oneLine(file) : '';
  }
  return '';
}

function formatValue(v: unknown, titles: Map<string, string> | undefined): string {
  if (Array.isArray(v)) {
    return v
      .map((x) => formatItem(x, titles))
      .filter(Boolean)
      .join(', ');
  }
  return formatItem(v, titles);
}

/** Strings, and serialized arrays/objects, of sensitive fields: never shown under any key. */
function sensitiveNeedles(
  fields: Map<string, FieldInfo>,
  form: Record<string, unknown>,
): { text: string[]; json: Set<string> } {
  const text: string[] = [];
  const json = new Set<string>();
  for (const [name, info] of fields) {
    if (!info.sensitive || !Object.hasOwn(form, name)) continue;
    const v = form[name];
    if (typeof v === 'string' && v.trim() !== '') text.push(v.trim());
    else if (typeof v === 'object' && v !== null) json.add(JSON.stringify(v));
  }
  return { text, json };
}

function leaks(v: unknown, needles: { text: string[]; json: Set<string> }): boolean {
  if (typeof v === 'string') return needles.text.some((n) => v.includes(n));
  if (typeof v === 'object' && v !== null) {
    let s: string;
    try {
      s = JSON.stringify(v);
    } catch {
      return true;
    }
    return needles.json.has(s) || needles.text.some((n) => s.includes(n));
  }
  return false;
}

/**
 * One `label: value` line per submitted value, for the chat bubble (rendered as text). Values of
 * sensitive fields are masked; with `form`, a sensitive value copied under another key is
 * masked too. At most 500 characters.
 */
export function buildSummary(
  flow: FlowJson,
  payload: Record<string, unknown>,
  form: Record<string, unknown> = {},
): string {
  const fields = fieldsOf(flow);
  const needles = sensitiveNeedles(fields, isRecord(form) ? form : {});
  const lines: string[] = [];
  for (const [key, value] of Object.entries(isRecord(payload) ? payload : {})) {
    const info = fields.get(key);
    const text = formatValue(value, info?.titles);
    if (text === '') continue;
    const masked = info?.sensitive === true || leaks(value, needles);
    lines.push(`${oneLine(info?.label ?? key)}: ${masked ? MASK : text}`);
  }
  const summary = lines.join('\n') || EMPTY_SUMMARY;
  if (summary.length <= MAX_SUMMARY) return summary;
  // never end on half of a surrogate pair
  const cut = summary.slice(0, MAX_SUMMARY - 1).replace(/[\uD800-\uDBFF]$/, '');
  return `${cut}…`;
}
