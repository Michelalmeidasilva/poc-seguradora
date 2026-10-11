import type { ServerEvent } from '@seguradora/protocol';
import type { OutStatus } from '../ui/bubble-types';

export type { OutStatus };

export type BotMessageEvent = Extract<ServerEvent, { type: `message.${string}` }>;

export type UserContent =
  | { type: 'text'; text: string }
  | { type: 'voice'; durationMs: number; objectUrl?: string }
  | { type: 'quick_reply'; optionId: string; title: string; replyToId?: string }
  | { type: 'flow_submit'; flowId: string; summary: string; data?: Record<string, unknown> };

export type UserItem = {
  kind: 'user';
  id: string;
  ts: string;
  status: OutStatus;
  content: UserContent;
};
export type BotItem = { kind: 'bot'; id: string; seq: number; ts: string; event: BotMessageEvent };
export type NoticeItem = {
  kind: 'notice';
  id: string;
  ts: string;
  tone: 'info' | 'error';
  text: string;
};
export type ChatItem = UserItem | BotItem | NoticeItem;

export type Connection = 'connecting' | 'online' | 'reconnecting' | 'offline';

export interface ChatState {
  items: ChatItem[];
  typing: boolean;
  connection: Connection;
  /** Highest server `seq` applied in the current session (0 when none). */
  lastSeq: number;
  sessionId?: string;
  /** Ids of bot events already shown (dedupe across replays). */
  seen: Record<string, true>;
}

export const MAX_ITEMS = 500;

export const initialState = (): ChatState => ({
  items: [],
  typing: false,
  connection: 'connecting',
  lastSeq: 0,
  seen: {},
});

export function lastBotItemId(state: ChatState): string | undefined {
  for (let i = state.items.length - 1; i >= 0; i--) {
    const item = state.items[i];
    if (item?.kind === 'bot') return item.id;
  }
  return undefined;
}

/** Quick replies and template buttons are live only on the last bot message, until the user answers. */
export function isInteractive(state: ChatState, itemId: string): boolean {
  if (lastBotItemId(state) !== itemId) return false;
  for (let i = state.items.length - 1; i >= 0; i--) {
    const item = state.items[i];
    if (item?.kind === 'user') return false;
    if (item?.kind === 'bot' && item.id === itemId) return true;
  }
  return false;
}
