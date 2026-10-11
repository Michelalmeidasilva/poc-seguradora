import { MAX_ITEMS, initialState, type ChatItem, type ChatState } from './model';

const KEY = 'seguradora-chat:v1';
const KEEP = 200;

interface Stored {
  v: 1;
  sessionId: string;
  lastSeq: number;
  items: ChatItem[];
}

/** Makes an item safe to store: no blob URLs (they die with the page) and no in-flight statuses. */
function toStorable(item: ChatItem): ChatItem {
  if (item.kind !== 'user') return item;
  const status = item.status === 'sending' ? 'failed' : item.status;
  if (item.content.type === 'voice') {
    const voice = { ...item.content };
    delete voice.objectUrl;
    return { ...item, status, content: voice };
  }
  return { ...item, status };
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
  const items = s.items.slice(-MAX_ITEMS) as ChatItem[];
  const seen: Record<string, true> = {};
  for (const item of items) if (item.kind === 'bot') seen[item.id] = true;
  return { ...initialState(), sessionId: s.sessionId, lastSeq: s.lastSeq, items, seen };
}
