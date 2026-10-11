import { useCallback, useEffect, useReducer, useRef } from 'react';
import { ChatClient, type ChatClientOptions, type Draft } from '../transport/chat-client';
import { initialState, type ChatState, type UserContent, type UserItem } from './model';
import { loadChat, saveChat } from './persistence';
import { chatReducer } from './reducer';
import type { TabGuard, TabStatus } from './tab-lock';
import { useTabGuard } from './useTabGuard';

export interface ChatClientLike {
  start(initial?: { sessionId: string; lastSeq: number }): Promise<void>;
  stop(): void;
  send(draft: Draft): string;
  resend(id: string, draft?: Draft): boolean | void;
}

export interface UseChatOptions {
  createClient?(o: ChatClientOptions): ChatClientLike;
  storage?: Storage;
  guard?: TabGuard;
  now?(): number;
}

export interface ChatApi {
  state: ChatState;
  tab: TabStatus;
  sendText(text: string): void;
  sendChoice(optionId: string, title: string, replyToId: string): void;
  sendVoice(blob: Blob, durationMs: number): void;
  sendFlowSubmit(flowId: string, data: Record<string, unknown>, summary: string): void;
  resend(id: string): void;
  /** Whether a failed message can be redelivered (voice restored after a reload cannot). */
  canResend(id: string): boolean;
  takeOver(): void;
}

const SAVE_DELAY_MS = 300;
const DRAFT_MEMORY_LIMIT = 100;

/**
 * Rebuilds the outgoing draft from a bubble, so a message restored after a reload can be resent
 * with its original id. Known limit: voice (the blob does not survive a reload) and legacy items
 * without replyToId/data have no draft; a voice sent in this page lifetime is covered by the
 * in-memory draft map of useChat instead.
 */
function draftFor(content: UserContent): Draft | undefined {
  switch (content.type) {
    case 'text':
      return { type: 'user.text', payload: { text: content.text } };
    case 'quick_reply':
      return content.replyToId
        ? {
            type: 'user.quick_reply',
            payload: { optionId: content.optionId, replyToId: content.replyToId },
          }
        : undefined;
    case 'flow_submit':
      return content.data
        ? { type: 'user.flow_submit', payload: { flowId: content.flowId, data: content.data } }
        : undefined;
    case 'voice':
      return undefined;
  }
}

export function useChat(options: UseChatOptions = {}): ChatApi {
  const storage =
    options.storage ?? (typeof sessionStorage === 'undefined' ? undefined : sessionStorage);
  const now = options.now ?? Date.now;
  const [state, dispatch] = useReducer(
    chatReducer,
    undefined,
    () => (storage && loadChat(storage)) || initialState(),
  );
  const guard = useTabGuard(options.guard);
  const clientRef = useRef<ChatClientLike | undefined>(undefined);
  // Drafts of messages sent in this page lifetime; survives client re-creation (e.g. a tab
  // demotion and takeover) and covers what draftFor() cannot rebuild (voice).
  const draftsRef = useRef(new Map<string, Draft>());
  const stateRef = useRef(state);
  stateRef.current = state;

  // (Re)start the client while this tab owns the chat.
  useEffect(() => {
    if (guard.status !== 'active') return;
    const create = options.createClient ?? ((o: ChatClientOptions) => new ChatClient(o));
    const client = create({
      onServerEvent: (event) => dispatch({ type: 'server_event', event }),
      onConnection: (connection) => dispatch({ type: 'connection', connection }),
      onOutgoing: (id, status) => dispatch({ type: 'user_status', id, status }),
      onSession: (sessionId) => dispatch({ type: 'session', sessionId }),
      onSessionReset: () => dispatch({ type: 'session_reset', ts: new Date(now()).toISOString() }),
    });
    clientRef.current = client;
    // Defer start() to a microtask: React StrictMode runs effect -> cleanup -> effect
    // synchronously in dev, and a cancelled first run must not fire a second POST /v1/session.
    let cancelled = false;
    let started = false;
    queueMicrotask(() => {
      if (cancelled) return;
      started = true;
      const saved = stateRef.current;
      void client.start(
        saved.sessionId ? { sessionId: saved.sessionId, lastSeq: saved.lastSeq } : undefined,
      );
    });
    return () => {
      cancelled = true;
      if (started) client.stop();
      clientRef.current = undefined;
    };
    // The client is created once per ownership change; options are read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guard.status]);

  // Persist the conversation (debounced).
  useEffect(() => {
    if (!storage) return;
    const timer = setTimeout(() => saveChat(storage, state), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state, storage]);

  const queue = useCallback(
    (draft: Draft, content: UserContent) => {
      const client = clientRef.current;
      if (!client) return;
      const id = client.send(draft);
      draftsRef.current.set(id, draft);
      if (draftsRef.current.size > DRAFT_MEMORY_LIMIT) {
        const oldest = draftsRef.current.keys().next().value;
        if (oldest !== undefined) draftsRef.current.delete(oldest);
      }
      const item: UserItem = {
        kind: 'user',
        id,
        ts: new Date(now()).toISOString(),
        status: 'sending',
        content,
      };
      dispatch({ type: 'user_queued', item });
    },
    [now],
  );

  return {
    state,
    tab: guard.status,
    sendText: (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      queue({ type: 'user.text', payload: { text: trimmed } }, { type: 'text', text: trimmed });
    },
    sendChoice: (optionId, title, replyToId) =>
      queue(
        { type: 'user.quick_reply', payload: { optionId, replyToId } },
        { type: 'quick_reply', optionId, title, replyToId },
      ),
    sendVoice: (blob, durationMs) => {
      const objectUrl = URL.createObjectURL(blob);
      queue(
        { type: 'user.voice', payload: { mediaId: `local-${crypto.randomUUID()}`, durationMs } },
        { type: 'voice', durationMs, objectUrl },
      );
    },
    sendFlowSubmit: (flowId, data, summary) =>
      queue(
        { type: 'user.flow_submit', payload: { flowId, data } },
        { type: 'flow_submit', flowId, summary, data },
      ),
    resend: (id) => {
      const item = stateRef.current.items.find((i) => i.kind === 'user' && i.id === id);
      const draft =
        draftsRef.current.get(id) ?? (item?.kind === 'user' ? draftFor(item.content) : undefined);
      clientRef.current?.resend(id, draft);
    },
    canResend: (id) => {
      if (draftsRef.current.has(id)) return true;
      const item = state.items.find((i) => i.kind === 'user' && i.id === id);
      return item?.kind === 'user' && draftFor(item.content) !== undefined;
    },
    takeOver: guard.takeOver,
  };
}
