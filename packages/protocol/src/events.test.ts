import { describe, expect, it } from 'vitest';
import { LIMITS, parseServerEvent } from './index';

const base = {
  v: 1,
  id: '0192f4c8-7b1a-7c3e-9a55-3f2d1e0b8a41',
  seq: 1,
  sessionId: 'sess-1',
  correlationId: 'corr-1',
  ts: '2026-10-10T12:00:00.000Z',
};

const button = { type: 'quick_reply', id: 'b1', title: 'Sim' };

const fixtures: Record<string, unknown> = {
  'message.text': { text: 'Olá!' },
  'message.voice': { mediaUrl: 'https://exemplo.invalid/a.ogg', durationMs: 3200 },
  'message.code': { language: 'ts', code: 'const a = 1;' },
  'message.location': { latitude: -23.55, longitude: -46.63, name: 'Sé' },
  'message.template': { body: 'Corpo', buttons: [button] },
  'message.carousel': {
    cards: [
      { mediaUrl: 'https://exemplo.invalid/1.jpg', mediaType: 'image', title: 'Um', buttons: [] },
      { mediaUrl: 'https://exemplo.invalid/2.jpg', mediaType: 'image', title: 'Dois', buttons: [] },
    ],
  },
  'message.quick_replies': { text: 'Escolha', options: [{ id: 'a', title: 'A' }] },
  'message.flow': {
    flowId: 'f1',
    body: 'Preencha',
    ctaLabel: 'Abrir',
    flowJson: { version: '7.1', screens: [] },
  },
  'status.typing': { state: 'start' },
  'status.delivered': { messageId: 'm1' },
  'status.read': { messageId: 'm1' },
  error: { code: 'rate_limited', message: 'Muitas requisições' },
};

const event = (type: string, payload: unknown, extra: object = {}) => ({
  ...base,
  type,
  payload,
  ...extra,
});

describe('parseServerEvent', () => {
  it.each(Object.entries(fixtures))('accepts %s', (type, payload) => {
    const r = parseServerEvent(event(type, payload));
    expect(r.ok).toBe(true);
  });

  it('returns the typed event on success', () => {
    const r = parseServerEvent(event('message.text', { text: 'Olá!' }));
    expect(r.ok && r.value.type).toBe('message.text');
  });

  it('rejects an unknown type', () => {
    expect(parseServerEvent(event('message.hologram', {})).ok).toBe(false);
  });

  it('rejects a missing seq', () => {
    const noSeq = event('message.text', { text: 'oi' }) as Record<string, unknown>;
    delete noSeq.seq;
    expect(parseServerEvent(noSeq).ok).toBe(false);
  });

  it.each([-1, 1.5])('rejects an invalid seq (%s)', (seq) => {
    expect(parseServerEvent(event('message.text', { text: 'oi' }, { seq })).ok).toBe(false);
  });

  it('rejects a wrong protocol version', () => {
    expect(parseServerEvent(event('message.text', { text: 'oi' }, { v: 2 })).ok).toBe(false);
  });

  it('rejects a non-uuid id', () => {
    expect(parseServerEvent(event('message.text', { text: 'oi' }, { id: 'abc' })).ok).toBe(false);
  });

  it('rejects text above the limit', () => {
    const text = 'a'.repeat(LIMITS.maxTextLength + 1);
    expect(parseServerEvent(event('message.text', { text })).ok).toBe(false);
  });

  it('rejects more than 3 quick reply options', () => {
    const options = ['a', 'b', 'c', 'd'].map((id) => ({ id, title: id }));
    expect(parseServerEvent(event('message.quick_replies', { text: 'x', options })).ok).toBe(false);
  });

  it('rejects a quick reply title above 20 characters', () => {
    const options = [{ id: 'a', title: 'x'.repeat(21) }];
    expect(parseServerEvent(event('message.quick_replies', { text: 'x', options })).ok).toBe(false);
  });

  it('rejects a carousel with a single card', () => {
    const cards = [
      { mediaUrl: 'https://exemplo.invalid/1.jpg', mediaType: 'image', title: 'Um', buttons: [] },
    ];
    expect(parseServerEvent(event('message.carousel', { cards })).ok).toBe(false);
  });

  it('rejects an out of range latitude', () => {
    const payload = { latitude: 91, longitude: 0 };
    expect(parseServerEvent(event('message.location', payload)).ok).toBe(false);
  });

  it('rejects an unknown error code', () => {
    const payload = { code: 'boom', message: 'x' };
    expect(parseServerEvent(event('error', payload)).ok).toBe(false);
  });

  it('returns a ZodError on failure', () => {
    const r = parseServerEvent({});
    expect(!r.ok && r.error.issues.length > 0).toBe(true);
  });
});

describe('protocol hardening (server events)', () => {
  const badUrls = ['javascript:alert(1)', 'data:text/html;base64,AAAA', 'vbscript:x'];
  const card = (mediaUrl: string) => ({ mediaUrl, mediaType: 'image', title: 'T', buttons: [] });
  const urlButton = (url: string) => ({ type: 'url', title: 'Abrir', url });

  it.each(badUrls)('rejects %s as voice mediaUrl', (u) => {
    expect(parseServerEvent(event('message.voice', { mediaUrl: u, durationMs: 1 })).ok).toBe(false);
  });
  it.each(badUrls)('rejects %s as carousel card mediaUrl', (u) => {
    const cards = [card(u), card('https://exemplo.invalid/2.jpg')];
    expect(parseServerEvent(event('message.carousel', { cards })).ok).toBe(false);
  });
  it.each(badUrls)('rejects %s as url button', (u) => {
    const payload = { body: 'x', buttons: [urlButton(u)] };
    expect(parseServerEvent(event('message.template', payload)).ok).toBe(false);
  });
  it.each(['https://exemplo.invalid/a', 'http://exemplo.invalid/a'])('accepts %s', (u) => {
    expect(parseServerEvent(event('message.voice', { mediaUrl: u, durationMs: 1 })).ok).toBe(true);
    const payload = { body: 'x', buttons: [urlButton(u)] };
    expect(parseServerEvent(event('message.template', payload)).ok).toBe(true);
  });

  it('accepts an error with and without messageId and retryAfterMs', () => {
    const p = { code: 'rate_limited', message: 'x' };
    expect(parseServerEvent(event('error', p)).ok).toBe(true);
    expect(parseServerEvent(event('error', { ...p, messageId: 'm1', retryAfterMs: 1500 })).ok).toBe(
      true,
    );
  });
  it.each([-1, 1.5])('rejects error retryAfterMs %s', (retryAfterMs) => {
    const p = { code: 'rate_limited', message: 'x', retryAfterMs };
    expect(parseServerEvent(event('error', p)).ok).toBe(false);
  });
  it('rejects an empty error messageId', () => {
    const p = { code: 'rate_limited', message: 'x', messageId: '' };
    expect(parseServerEvent(event('error', p)).ok).toBe(false);
  });

  it('exposes LIMITS.maxEventBytes as a positive integer', () => {
    expect(Number.isInteger(LIMITS.maxEventBytes) && LIMITS.maxEventBytes > 0).toBe(true);
  });

  it('accepts a 128 char sessionId and rejects 129 (server)', () => {
    const p = { text: 'oi' };
    expect(parseServerEvent(event('message.text', p, { sessionId: 's'.repeat(128) })).ok).toBe(
      true,
    );
    expect(parseServerEvent(event('message.text', p, { sessionId: 's'.repeat(129) })).ok).toBe(
      false,
    );
  });
  it('rejects a 129 char correlationId (server)', () => {
    const e = event('message.text', { text: 'oi' }, { correlationId: 'c'.repeat(129) });
    expect(parseServerEvent(e).ok).toBe(false);
  });
});
