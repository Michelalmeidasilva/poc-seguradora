import {
  MAX_ITEMS,
  initialState,
  type BotItem,
  type ChatItem,
  type ChatState,
  type UserItem,
} from './model';

const KEY = 'seguradora-chat:v1';
const KEEP = 200;
const EXPIRED_FLOW_TEXT = 'Este formulário expirou ao recarregar. Reabra a etapa para continuar.';
// Legacy generated catalog reviews depended on a volatile draft. Keep this local;
// persistence tests check membership against the canonical catalog without a runtime dependency.
const CATALOG_REVIEW_IDS = new Set([
  'ADE-06',
  'ADE-07',
  'PAG-04',
  'DEP-06',
  'DEP-17',
  'DEP-21',
  'EXC-03',
  'PLA-06',
  'CAD-03',
  'FUN-06',
  'COB-05',
  'CAN-05',
  'REN-02',
  'REN-03',
]);

interface Stored {
  v: 1;
  sessionId: string;
  lastSeq: number;
  items: ChatItem[];
}

/** Flow submissions keep only flowId and summary (older saves may still carry `data`). */
function withoutFlowData(item: UserItem): UserItem {
  // `?.`: stored items are not validated, content may be missing
  if (item.content?.type !== 'flow_submit') return item;
  const { flowId, summary } = item.content;
  return { ...item, content: { type: 'flow_submit', flowId, summary } };
}

/** Preserve punctuation and the last two digits of recognized CPF values. */
function maskCpf(text: string): string {
  return text.replace(
    /(?<!\d)(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{11})(?!\d)/g,
    (cpf) => cpf.slice(0, -2).replace(/\d/g, '*') + cpf.slice(-2),
  );
}

/** Mask copied user-visible content; leave the active item and static identifiers untouched. */
function withoutRawCpf(item: UserItem): UserItem {
  if (item.content?.type === 'text') {
    return { ...item, content: { ...item.content, text: maskCpf(item.content.text) } };
  }
  if (item.content?.type === 'quick_reply') {
    return { ...item, content: { ...item.content, title: maskCpf(item.content.title) } };
  }
  if (item.content?.type === 'flow_submit') {
    return { ...item, content: { ...item.content, summary: maskCpf(item.content.summary) } };
  }
  return item;
}

/** A draft may live in the current tab's reducer state, never in replayable storage/history. */
function expireDraftFlow(item: BotItem): BotItem {
  if (item.event.type !== 'message.flow') return item;
  const { initialData, flowJson, flowId } = item.event.payload;
  if (flowId === 'IDE-08' || flowId === 'IDE-06') {
    return {
      ...item,
      event: {
        ...item.event,
        type: 'message.text',
        payload: {
          text: 'A identificação agora é pelo chat. Digite um CPF com 11 números ou XXX.XXX.XXX-XX para continuar.',
        },
      } as BotItem['event'],
    };
  }
  const screens = (flowJson as { screens?: unknown[] } | undefined)?.screens;
  const legacyTerminalReview =
    CATALOG_REVIEW_IDS.has(flowId) &&
    Array.isArray(screens) &&
    screens.length === 1 &&
    typeof screens[0] === 'object' &&
    screens[0] !== null &&
    'id' in screens[0] &&
    screens[0].id === 'REVIEW' &&
    'terminal' in screens[0] &&
    screens[0].terminal === true;
  if (!initialData && !legacyTerminalReview) return item;
  return {
    ...item,
    event: {
      ...item.event,
      type: 'message.text',
      payload: { text: EXPIRED_FLOW_TEXT },
    } as BotItem['event'],
  };
}

/**
 * Makes an item safe to store: no blob URLs (they die with the page), no flow submission data
 * and no in-flight statuses.
 */
function toStorable(item: ChatItem): ChatItem {
  if (item.kind === 'bot') return expireDraftFlow(item);
  if (item.kind !== 'user') return item;
  const status = item.status === 'sending' ? 'failed' : item.status;
  if (item.content.type === 'voice') {
    const voice = { ...item.content };
    delete voice.objectUrl;
    return { ...item, status, content: voice };
  }
  return { ...withoutRawCpf(withoutFlowData(item)), status };
}

function writeChat(storage: Storage, state: ChatState): boolean {
  if (!state.sessionId) return false;
  const stored: Stored = {
    v: 1,
    sessionId: state.sessionId,
    lastSeq: state.lastSeq,
    items: state.items.slice(-KEEP).map(toStorable),
  };
  try {
    storage.setItem(KEY, JSON.stringify(stored));
    return true;
  } catch {
    // storage full or unavailable: the chat keeps working without persistence
    return false;
  }
}

export function saveChat(storage: Storage, state: ChatState): void {
  writeChat(storage, state);
}

export function loadChat(storage: Storage): ChatState | undefined {
  let raw: string | null;
  try {
    raw = storage.getItem(KEY);
  } catch {
    return undefined;
  }
  if (!raw) return undefined;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof data !== 'object' || data === null) return undefined;
  const s = data as Partial<Stored>;
  if (
    s.v !== 1 ||
    typeof s.sessionId !== 'string' ||
    typeof s.lastSeq !== 'number' ||
    !Array.isArray(s.items)
  ) {
    return undefined;
  }
  const items = (s.items.slice(-MAX_ITEMS) as ChatItem[]).map((i) =>
    i.kind === 'user'
      ? withoutRawCpf(withoutFlowData(i))
      : i.kind === 'bot'
        ? expireDraftFlow(i)
        : i,
  );
  const seen: Record<string, true> = {};
  for (const item of items) if (item.kind === 'bot') seen[item.id] = true;
  const restored = { ...initialState(), sessionId: s.sessionId, lastSeq: s.lastSeq, items, seen };
  // Rewrite synchronously before exposing a restored state so old drafts/CTAs cannot replay.
  if (!writeChat(storage, restored)) {
    try {
      storage.removeItem(KEY);
    } catch {
      // If storage is inaccessible, do not restore this session into the UI.
    }
    return undefined;
  }
  return restored;
}
