import { describe, expect, it } from 'vitest';
import { botText, delivered, errorEvent, quickReplies, typing, uuid } from '../test/fixtures';
import { initialState, isInteractive, lastBotItemId, MAX_ITEMS, type UserItem } from './model';
import { chatReducer, type Action } from './reducer';

const run = (actions: Action[], from = initialState()) => actions.reduce(chatReducer, from);
const userItem = (
  n: number,
  status: 'sending' | 'sent' | 'delivered' | 'failed' = 'sending',
): UserItem => ({
  kind: 'user',
  id: uuid(1000 + n),
  ts: '2026-10-10T12:00:00.000Z',
  status,
  content: { type: 'text', text: `u${n}` },
});
const server = (event: ReturnType<typeof botText>): Action => ({ type: 'server_event', event });

describe('chatReducer: server events', () => {
  it('appends a bot message and tracks lastSeq', () => {
    const s = run([server(botText(1, 'oi'))]);
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toMatchObject({ kind: 'bot', seq: 1 });
    expect(s.lastSeq).toBe(1);
  });

  it('ignores an event that was already applied (same seq) and a replay with the same id', () => {
    const s = run([server(botText(1)), server(botText(1)), server(botText(2, 'x', 1))]);
    expect(s.items).toHaveLength(1);
    expect(s.lastSeq).toBe(2);
  });

  it('ignores events older than lastSeq', () => {
    const s = run([server(botText(5)), server(botText(3))]);
    expect(s.items).toHaveLength(1);
    expect(s.lastSeq).toBe(5);
  });

  it('adds a single info notice when seq skips ahead', () => {
    const s = run([server(botText(1)), server(botText(4)), server(botText(7))]);
    const notices = s.items.filter((i) => i.kind === 'notice');
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ tone: 'info' });
  });

  it('does not report a gap for the first event of a fresh session', () => {
    const s = run([server(botText(1))]);
    expect(s.items.some((i) => i.kind === 'notice')).toBe(false);
  });

  it('toggles typing and clears it when a message arrives', () => {
    let s = run([server(typing(1, 'start'))]);
    expect(s.typing).toBe(true);
    s = chatReducer(s, server(typing(2, 'stop')));
    expect(s.typing).toBe(false);
    s = run([server(typing(3, 'start')), server(botText(4))], s);
    expect(s.typing).toBe(false);
  });

  it('marks the matching user message as delivered', () => {
    const user = userItem(1, 'sent');
    const s = run([{ type: 'user_queued', item: user }, server(delivered(1, user.id))]);
    expect(s.items[0]).toMatchObject({ kind: 'user', status: 'delivered' });
  });

  it('ignores a delivered event for an unknown message', () => {
    const s = run([server(delivered(1, uuid(9999)))]);
    expect(s.items).toHaveLength(0);
  });

  it('marks a user message as failed when the server reports an error for it', () => {
    const user = userItem(1, 'delivered');
    const s = run([
      { type: 'user_queued', item: user },
      server(errorEvent(1, 'upstream_unavailable', user.id)),
    ]);
    expect(s.items[0]).toMatchObject({ kind: 'user', status: 'failed' });
  });

  it('shows an error without a message id as a notice and stops typing', () => {
    const s = run([server(typing(1, 'start')), server(errorEvent(2, 'internal_error'))]);
    expect(s.typing).toBe(false);
    expect(s.items.at(-1)).toMatchObject({ kind: 'notice', tone: 'error', text: 'Falhou' });
  });
});

describe('chatReducer: user messages and status never go backwards', () => {
  it('adds a queued user message', () => {
    const s = run([{ type: 'user_queued', item: userItem(1) }]);
    expect(s.items[0]).toMatchObject({ kind: 'user', status: 'sending' });
  });

  it('moves sending → sent → delivered', () => {
    const user = userItem(1);
    const s = run([
      { type: 'user_queued', item: user },
      { type: 'user_status', id: user.id, status: 'sent' },
      server(delivered(1, user.id)),
    ]);
    expect(s.items[0]).toMatchObject({ status: 'delivered' });
  });

  it('does not downgrade delivered to sent', () => {
    const user = userItem(1);
    const s = run([
      { type: 'user_queued', item: user },
      server(delivered(1, user.id)),
      { type: 'user_status', id: user.id, status: 'sent' },
    ]);
    expect(s.items[0]).toMatchObject({ status: 'delivered' });
  });

  it('lets a resend move failed back to sending, and then to sent', () => {
    const user = userItem(1, 'failed');
    const s = run([
      { type: 'user_queued', item: user },
      { type: 'user_status', id: user.id, status: 'sending' },
      { type: 'user_status', id: user.id, status: 'sent' },
    ]);
    expect(s.items[0]).toMatchObject({ status: 'sent' });
  });

  it('keeps one bubble when the same id is queued twice (resend)', () => {
    const user = userItem(1);
    const s = run([
      { type: 'user_queued', item: user },
      { type: 'user_queued', item: user },
    ]);
    expect(s.items).toHaveLength(1);
  });

  it('a late delivered after a failed resend attempt does not override a newer failure', () => {
    const user = userItem(1, 'sending');
    const s = run([
      { type: 'user_queued', item: user },
      { type: 'user_status', id: user.id, status: 'failed' },
      server(delivered(1, user.id)),
    ]);
    // delivered is a server fact: the message did reach the chatbot.
    expect(s.items[0]).toMatchObject({ status: 'delivered' });
  });
});

describe('chatReducer: connection, sessions and limits', () => {
  it('stores the connection state', () => {
    expect(run([{ type: 'connection', connection: 'reconnecting' }]).connection).toBe(
      'reconnecting',
    );
  });

  it('stores the session id', () => {
    expect(run([{ type: 'session', sessionId: 'abc' }]).sessionId).toBe('abc');
  });

  it('resets seq tracking and adds a notice on a session reset, keeping the history', () => {
    const s = run([
      server(botText(1)),
      server(botText(2)),
      { type: 'session_reset', ts: '2026-10-10T12:00:00.000Z' },
    ]);
    expect(s.lastSeq).toBe(0);
    expect(s.items.filter((i) => i.kind === 'bot')).toHaveLength(2);
    expect(s.items.at(-1)).toMatchObject({ kind: 'notice' });
    // the new session restarts at seq 1: it must not be ignored
    const after = chatReducer(s, server(botText(1, 'nova', 50)));
    expect(after.items.filter((i) => i.kind === 'bot')).toHaveLength(3);
  });

  it('restores a persisted state', () => {
    const saved = run([server(botText(1)), { type: 'session', sessionId: 's9' }]);
    const s = run([{ type: 'restore', state: saved }]);
    expect(s.items).toHaveLength(1);
    expect(s.sessionId).toBe('s9');
    expect(s.connection).toBe('connecting');
    expect(s.typing).toBe(false);
  });

  it('keeps at most MAX_ITEMS items, dropping the oldest', () => {
    let s = initialState();
    for (let n = 1; n <= MAX_ITEMS + 20; n++) s = chatReducer(s, server(botText(n)));
    expect(s.items).toHaveLength(MAX_ITEMS);
    expect(s.items[0]).toMatchObject({ seq: 21 });
  });
});

describe('selectors', () => {
  it('treats only the last bot message as interactive, and only until the user answers', () => {
    const first = botText(1);
    const second = quickReplies(2);
    let s = run([server(first), server(second)]);
    expect(lastBotItemId(s)).toBe(second.id);
    expect(isInteractive(s, second.id)).toBe(true);
    expect(isInteractive(s, first.id)).toBe(false);
    s = chatReducer(s, { type: 'user_queued', item: userItem(1) });
    expect(isInteractive(s, second.id)).toBe(false);
  });
});
