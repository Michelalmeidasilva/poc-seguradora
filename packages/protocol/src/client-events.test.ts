import { describe, expect, it } from 'vitest';
import { LIMITS, parseClientEvent } from './index';

const base = {
  v: 1,
  id: '0192f4c8-7b1a-7c3e-9a55-3f2d1e0b8a42',
  sessionId: 'sess-1',
  correlationId: 'corr-1',
  ts: '2026-10-10T12:00:00.000Z',
};

const event = (type: string, payload: unknown) => ({ ...base, type, payload });

const fixtures: Record<string, unknown> = {
  'user.text': { text: 'Olá' },
  'user.voice': { mediaId: 'media-1', durationMs: 2000 },
  'user.quick_reply': { optionId: 'a', replyToId: '0192f4c8-7b1a-7c3e-9a55-3f2d1e0b8a41' },
  'user.flow_submit': { flowId: 'f1', data: { nome: 'Maria' } },
  'user.flow_data_exchange': { flowId: 'f1', screen: 'COTACAO', action: 'data_exchange', data: {} },
  'user.typing': { state: 'stop' },
  'user.ack': { lastSeq: 7 },
};

describe('parseClientEvent', () => {
  it.each(Object.entries(fixtures))('accepts %s', (type, payload) => {
    expect(parseClientEvent(event(type, payload)).ok).toBe(true);
  });

  it('trims the text of user.text', () => {
    const r = parseClientEvent(event('user.text', { text: '  oi  ' }));
    expect(r.ok && r.value.type === 'user.text' && r.value.payload.text).toBe('oi');
  });

  it('rejects whitespace only text', () => {
    expect(parseClientEvent(event('user.text', { text: '   \n ' })).ok).toBe(false);
  });

  it('rejects an empty text', () => {
    expect(parseClientEvent(event('user.text', { text: '' })).ok).toBe(false);
  });

  it('rejects text above the limit', () => {
    const text = 'a'.repeat(LIMITS.maxTextLength + 1);
    expect(parseClientEvent(event('user.text', { text })).ok).toBe(false);
  });

  it('rejects extra fields in the payload', () => {
    expect(parseClientEvent(event('user.text', { text: 'oi', admin: true })).ok).toBe(false);
  });

  it('rejects a negative ack', () => {
    expect(parseClientEvent(event('user.ack', { lastSeq: -1 })).ok).toBe(false);
  });

  it('rejects an unknown type', () => {
    expect(parseClientEvent(event('user.teleport', {})).ok).toBe(false);
  });

  it('does not accept server only types', () => {
    expect(parseClientEvent(event('message.text', { text: 'oi' })).ok).toBe(false);
  });
});
