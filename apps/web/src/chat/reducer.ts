import type { ServerEvent } from '@seguradora/protocol';
import {
  initialState,
  MAX_ITEMS,
  type BotMessageEvent,
  type ChatItem,
  type ChatState,
  type Connection,
  type OutStatus,
  type UserItem,
} from './model';

export type Action =
  | { type: 'restore'; state: ChatState }
  | { type: 'session'; sessionId: string }
  | { type: 'session_reset'; ts: string }
  | { type: 'user_queued'; item: UserItem }
  | { type: 'user_status'; id: string; status: OutStatus }
  | { type: 'server_event'; event: ServerEvent }
  | { type: 'connection'; connection: Connection };

const RANK: Record<OutStatus, number> = { failed: 0, sending: 1, sent: 2, delivered: 3 };

const cap = (items: ChatItem[]): ChatItem[] =>
  items.length > MAX_ITEMS ? items.slice(items.length - MAX_ITEMS) : items;

const mapUser = (items: ChatItem[], id: string, fn: (u: UserItem) => UserItem): ChatItem[] =>
  items.map((i) => (i.kind === 'user' && i.id === id ? fn(i) : i));

const isMessage = (e: ServerEvent): e is BotMessageEvent => e.type.startsWith('message.');

export function chatReducer(state: ChatState, action: Action): ChatState {
  switch (action.type) {
    case 'restore':
      return { ...action.state, connection: 'connecting', typing: false };

    case 'session':
      return { ...state, sessionId: action.sessionId };

    case 'session_reset':
      return {
        ...state,
        lastSeq: 0,
        typing: false,
        items: cap([
          ...state.items,
          {
            kind: 'notice',
            id: `reset-${action.ts}`,
            ts: action.ts,
            tone: 'info',
            text: 'Uma nova conversa foi iniciada.',
          },
        ]),
      };

    case 'connection':
      return { ...state, connection: action.connection };

    case 'user_queued': {
      if (state.items.some((i) => i.kind === 'user' && i.id === action.item.id)) return state;
      return { ...state, items: cap([...state.items, action.item]) };
    }

    case 'user_status':
      return {
        ...state,
        items: mapUser(state.items, action.id, (u) => {
          // A failure (e.g. a server error{messageId} that beat the POST's 202) is only replaced by
          // a resend (sending); a late `sent` must not hide it. Otherwise status only moves forward.
          if (u.status === 'failed') {
            return action.status === 'sending' || action.status === 'delivered'
              ? { ...u, status: action.status }
              : u;
          }
          // A client-side failure only applies to a message still in flight (RANK alone would
          // reject sending → failed, since failed ranks lowest).
          if (action.status === 'failed')
            return u.status === 'sending' ? { ...u, status: 'failed' } : u;
          return RANK[action.status] > RANK[u.status] ? { ...u, status: action.status } : u;
        }),
      };

    case 'server_event':
      return applyServerEvent(state, action.event);
  }
}

function applyServerEvent(state: ChatState, event: ServerEvent): ChatState {
  if (event.seq <= state.lastSeq) return state;

  let next: ChatState = { ...state, lastSeq: event.seq };
  if (
    state.lastSeq > 0 &&
    event.seq > state.lastSeq + 1 &&
    !state.items.some((i) => i.id === 'gap-notice')
  ) {
    next = {
      ...next,
      items: cap([
        ...next.items,
        {
          kind: 'notice',
          id: 'gap-notice',
          ts: event.ts,
          tone: 'info',
          text: 'Algumas mensagens podem ter sido perdidas durante a reconexão.',
        },
      ]),
    };
  }

  if (isMessage(event)) {
    if (next.seen[event.id]) return next;
    return {
      ...next,
      typing: false,
      seen: { ...next.seen, [event.id]: true },
      items: cap([
        ...next.items,
        { kind: 'bot', id: event.id, seq: event.seq, ts: event.ts, event },
      ]),
    };
  }

  switch (event.type) {
    case 'status.typing':
      return { ...next, typing: event.payload.state === 'start' };
    case 'status.delivered':
      return {
        ...next,
        items: mapUser(next.items, event.payload.messageId, (u) => ({ ...u, status: 'delivered' })),
      };
    case 'status.read':
      return next;
    case 'error': {
      const { messageId, message } = event.payload;
      if (messageId) {
        return {
          ...next,
          typing: false,
          items: mapUser(next.items, messageId, (u) => ({ ...u, status: 'failed' })),
        };
      }
      return {
        ...next,
        typing: false,
        items: cap([
          ...next.items,
          { kind: 'notice', id: event.id, ts: event.ts, tone: 'error', text: message },
        ]),
      };
    }
    default:
      return next;
  }
}

export { initialState };
