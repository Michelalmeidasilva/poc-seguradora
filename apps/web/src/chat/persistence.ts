import { MAX_ITEMS, initialState, type BotItem, type ChatItem, type ChatState, type UserItem } from './model';

const KEY = 'seguradora-chat:v1';
const KEEP = 200;

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

/** A draft may live in the current tab's reducer state, never in replayable storage. */
function withoutFlowInitialData(item: BotItem): BotItem {
  if (item.event.type !== 'message.flow' || !item.event.payload.initialData) return item;
  const payload = { ...item.event.payload };
  delete payload.initialData;
  return { ...item, event: { ...item.event, payload } } as BotItem;
}

/**
 * Makes an item safe to store: no blob URLs (they die with the page), no flow submission data
 * and no in-flight statuses.
 */
function toStorable(item: ChatItem): ChatItem {
  if (item.kind === 'bot') return withoutFlowInitialData(item);
  if (item.kind !== 'user') return item;
  const status = item.status === 'sending' ? 'failed' : item.status;
  if (item.content.type === 'voice') {
    const voice = { ...item.content };
    delete voice.objectUrl;
    return { ...item, status, content: voice };
  }
  return { ...withoutFlowData(item), status };
}

export function saveChat(storage: Storage, state: ChatState): void {
  if (!state.sessionId) return;
  const stored: Stored = {
    v: 1,
    sessionId: state.sessionId,
    lastSeq: state.lastSeq,
    items: state.items.slice(-KEEP).map(toStorable),
  };
  try {
    storage.setItem(KEY, JSON.stringify(stored));
  } catch {
    // storage full or unavailable: the chat keeps working without persistence
  }
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
    i.kind === 'user' ? withoutFlowData(i) : i.kind === 'bot' ? withoutFlowInitialData(i) : i,
  );
  const seen: Record<string, true> = {};
  for (const item of items) if (item.kind === 'bot') seen[item.id] = true;
  return { ...initialState(), sessionId: s.sessionId, lastSeq: s.lastSeq, items, seen };
}
