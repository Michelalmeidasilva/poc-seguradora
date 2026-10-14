import { useCallback, useEffect, useReducer, useRef } from 'react';
import { ChatClient, type ChatClientOptions, type Draft } from '../transport/chat-client';
import { randomId } from '../transport/random-id';
import { initialState, type ChatState, type UserContent, type UserItem } from './model';
import { clearChat, loadChat, saveChat } from './persistence';
import { chatReducer } from './reducer';
import type { TabGuard, TabStatus } from './tab-lock';
import { useTabGuard } from './useTabGuard';
import { DEMO_AUDIO_DURATION_MS, demoAudio, demoAudioBlob, type DemoAudioId } from './demo-audio';

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
  /** User messages currently queued by this client, excluding restored history. */
  hasPendingSend: boolean;
  sendText(text: string): void;
  sendChoice(optionId: string, title: string, replyToId: string): void;
  sendVoice(blob: Blob, durationMs: number): void;
  sendDemoVoice(id: DemoAudioId): void;
  sendFlowSubmit(flowId: string, data: Record<string, unknown>, summary: string): void;
  /** Sent through the outbox with no list item (nothing shown, nothing persisted). */
  sendFlowDataExchange(
    flowId: string,
    screen: string,
    action: string,
    data: Record<string, unknown>,
  ): void;
  resend(id: string): void;
  /** Whether a failed message can be redelivered (voice restored after a reload cannot). */
  canResend(id: string): boolean;
  takeOver(): void;
}

const SAVE_DELAY_MS = 300;
const DRAFT_MEMORY_LIMIT = 100;

/**
 * Rebuilds the outgoing draft from a bubble, so a message restored after a reload can be resent
 * with its original id. Known limit: voice (the blob does not survive a reload), flow submissions
 * (their data is never stored) and legacy items without replyToId have no draft; messages sent in
 * this page lifetime are covered by the in-memory draft map of useChat instead.
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
  const [sessionGeneration, restartSession] = useReducer((n: number) => n + 1, 0);
  const stopClientRef = useRef<(() => void) | undefined>(undefined);
  const clientRef = useRef<ChatClientLike | undefined>(undefined);
  // Drafts of messages sent in this page lifetime; survives client re-creation (e.g. a tab
  // demotion and takeover) and covers what draftFor() cannot rebuild (voice).
  const draftsRef = useRef(new Map<string, Draft>());
  const activeSendsRef = useRef(new Set<string>());
  const stateRef = useRef(state);
  stateRef.current = state;

  // (Re)start the client while this tab owns the chat.
  useEffect(() => {
    if (guard.status !== 'active') return;
    const activeSends = activeSendsRef.current;
    const create = options.createClient ?? ((o: ChatClientOptions) => new ChatClient(o));
    let cancelled = false;
    let started = false;
    const client = create({
      onServerEvent: (event) => {
        if (cancelled) return;
        if (event.type === 'status.delivered') activeSends.delete(event.payload.messageId);
        dispatch({ type: 'server_event', event });
      },
      onConnection: (connection) => {
        if (!cancelled) dispatch({ type: 'connection', connection });
      },
      onOutgoing: (id, status) => {
        if (cancelled) return;
        if (status === 'sending') activeSends.add(id);
        if (status === 'failed') activeSends.delete(id);
        dispatch({ type: 'user_status', id, status });
      },
      onSession: (sessionId) => {
        if (!cancelled) dispatch({ type: 'session', sessionId });
      },
      onSessionReset: () => {
        if (!cancelled) dispatch({ type: 'session_reset', ts: new Date(now()).toISOString() });
      },
    });
    clientRef.current = client;
    // Defer start() to a microtask: React StrictMode runs effect -> cleanup -> effect
    // synchronously in dev, and a cancelled first run must not fire a second POST /v1/session.
    queueMicrotask(() => {
      if (cancelled) return;
      started = true;
      const saved = stateRef.current;
      void client.start(
        saved.sessionId ? { sessionId: saved.sessionId, lastSeq: saved.lastSeq } : undefined,
      );
    });
    const stop = (discard = false) => {
      if (cancelled) return;
      // Ordinary ownership loss must mark in-flight messages failed for retry.
      // Explicit reset discards even synchronous callbacks from the old client.
      if (discard) cancelled = true;
      if (started) client.stop();
      cancelled = true;
      activeSends.clear();
      clientRef.current = undefined;
    };
    stopClientRef.current = () => stop(true);
    return () => stop();
    // Recreate on ownership changes or an explicit reset; read options at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guard.status, sessionGeneration]);

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
      activeSendsRef.current.add(id);
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
    hasPendingSend: state.items.some(
      (item) =>
        item.kind === 'user' &&
        activeSendsRef.current.has(item.id) &&
        (item.status === 'sending' || item.status === 'sent'),
    ),
    sendText: (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (trimmed === '/reset') {
        if (guard.status !== 'active') return;
        stopClientRef.current?.();
        draftsRef.current.clear();
        activeSendsRef.current.clear();
        if (storage) clearChat(storage);
        dispatch({ type: 'clear' });
        restartSession();
        return;
      }
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
        { type: 'user.voice', payload: { mediaId: `local-${randomId()}`, durationMs } },
        { type: 'voice', durationMs, objectUrl },
      );
    },
    sendDemoVoice: (id) => {
      if (!demoAudio.some((scenario) => scenario.id === id)) return;
      const objectUrl = URL.createObjectURL(demoAudioBlob(id));
      queue(
        { type: 'user.voice', payload: { mediaId: id, durationMs: DEMO_AUDIO_DURATION_MS } },
        { type: 'voice', durationMs: DEMO_AUDIO_DURATION_MS, objectUrl },
      );
    },
    sendFlowSubmit: (flowId, data, summary) =>
      queue(
        { type: 'user.flow_submit', payload: { flowId, data } },
        { type: 'flow_submit', flowId, summary },
      ),
    sendFlowDataExchange: (flowId, screen, action, data) => {
      // Not in draftsRef: with no item there is nothing to resend from.
      clientRef.current?.send({
        type: 'user.flow_data_exchange',
        payload: { flowId, screen, action, data },
      });
    },
    resend: (id) => {
      const item = stateRef.current.items.find((i) => i.kind === 'user' && i.id === id);
      const draft =
        draftsRef.current.get(id) ?? (item?.kind === 'user' ? draftFor(item.content) : undefined);
      if (!item && !draft) return;
      if (draft) draftsRef.current.set(id, draft);
      const client = clientRef.current;
      if (!client) return;
      activeSendsRef.current.add(id);
      if (client.resend(id, draft) === false) activeSendsRef.current.delete(id);
    },
    canResend: (id) => {
      if (draftsRef.current.has(id)) return true;
      const item = state.items.find((i) => i.kind === 'user' && i.id === id);
      return item?.kind === 'user' && draftFor(item.content) !== undefined;
    },
    takeOver: guard.takeOver,
  };
}
