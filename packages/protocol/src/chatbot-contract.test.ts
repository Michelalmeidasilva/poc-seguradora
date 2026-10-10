import { describe, expect, it } from 'vitest';
import {
  ChatbotRequestSchema,
  parseChatbotLine,
  parseClientEvent,
  parseServerEvent,
  serializeChatbotLine,
  ServerEventSchema,
  UnsequencedServerEventSchema,
} from './index';

const base = {
  v: 1,
  id: '0192f4c8-7b1a-7c3e-9a55-3f2d1e0b8a41',
  sessionId: 'sess-1',
  correlationId: 'corr-1',
  ts: '2026-10-10T12:00:00.000Z',
};

const clientEvent = {
  v: 1,
  id: '0192f4c8-7b1a-7c3e-9a55-3f2d1e0b8a42',
  sessionId: 'sess-1',
  correlationId: 'corr-1',
  ts: '2026-10-10T12:00:00.000Z',
  type: 'user.text',
  payload: { text: 'Olá' },
};

describe('ChatbotRequestSchema', () => {
  it('accepts a request wrapping a client event', () => {
    const r = ChatbotRequestSchema.safeParse({
      v: 1,
      sessionId: 'sess-1',
      correlationId: 'corr-1',
      event: clientEvent,
    });
    expect(r.success).toBe(true);
  });

  it('rejects an invalid wrapped event', () => {
    const r = ChatbotRequestSchema.safeParse({
      v: 1,
      sessionId: 'sess-1',
      correlationId: 'corr-1',
      event: { ...clientEvent, type: 'user.teleport' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects a wrong protocol version', () => {
    const r = ChatbotRequestSchema.safeParse({
      v: 2,
      sessionId: 'sess-1',
      correlationId: 'corr-1',
      event: clientEvent,
    });
    expect(r.success).toBe(false);
  });
});

describe('parseChatbotLine', () => {
  it.each([
    ['message.text', { text: 'Olá!' }],
    ['status.typing', { state: 'start' }],
    ['error', { code: 'internal_error', message: 'x', messageId: 'm1' }],
  ])('accepts %s without seq', (type, payload) => {
    const r = parseChatbotLine(JSON.stringify({ ...base, type, payload }));
    expect(r.ok).toBe(true);
  });

  it('strips a seq that the chatbot should not send', () => {
    const r = parseChatbotLine(
      JSON.stringify({ ...base, seq: 9, type: 'message.text', payload: { text: 'oi' } }),
    );
    expect(r.ok).toBe(true);
    expect(r.ok && 'seq' in r.value).toBe(false);
  });

  it('rejects text that is not JSON', () => {
    expect(parseChatbotLine('not json').ok).toBe(false);
  });

  it('rejects JSON that is not a server event', () => {
    expect(parseChatbotLine('{}').ok).toBe(false);
    expect(parseChatbotLine(JSON.stringify({ ...base, type: 'user.text', payload: {} })).ok).toBe(
      false,
    );
  });
});

describe('serializeChatbotLine', () => {
  it('produces one JSON line that round-trips', () => {
    const event = UnsequencedServerEventSchema.parse({
      ...base,
      type: 'message.text',
      payload: { text: 'oi' },
    });
    const line = serializeChatbotLine(event);
    expect(line.endsWith('\n')).toBe(true);
    expect(line.indexOf('\n')).toBe(line.length - 1);
    const back = parseChatbotLine(line.trim());
    expect(back.ok && back.value).toEqual(event);
  });
});

describe('UnsequencedServerEventSchema drift guard', () => {
  it('covers every server event type', () => {
    const names = (options: ReadonlyArray<{ shape: { type: { value: string } } }>) =>
      options.map((o) => o.shape.type.value).sort();
    expect(UnsequencedServerEventSchema.options.length).toBe(ServerEventSchema.options.length);
    expect(names(UnsequencedServerEventSchema.options)).toEqual(names(ServerEventSchema.options));
  });
});

describe('correlationId is header-safe', () => {
  const bad: Array<[string, string]> = [
    ['a newline', 'bad\nid'],
    ['a space', 'bad id'],
    ['non-ASCII', 'idé中'],
    ['empty', ''],
    ['129 chars', 'c'.repeat(129)],
  ];
  const good = ['corr-1', '0192f4c8-7b1a-7c3e-9a55-3f2d1e0b8a41', 'c'.repeat(128)];

  it.each(bad)('rejects %s in server events, client events and chatbot requests', (_n, id) => {
    expect(
      parseServerEvent({
        ...base,
        seq: 1,
        correlationId: id,
        type: 'message.text',
        payload: { text: 'oi' },
      }).ok,
    ).toBe(false);
    expect(parseClientEvent({ ...clientEvent, correlationId: id }).ok).toBe(false);
    expect(
      ChatbotRequestSchema.safeParse({
        v: 1,
        sessionId: 's',
        correlationId: id,
        event: clientEvent,
      }).success,
    ).toBe(false);
  });

  it.each(good)('accepts %s everywhere', (id) => {
    expect(
      parseServerEvent({
        ...base,
        seq: 1,
        correlationId: id,
        type: 'message.text',
        payload: { text: 'oi' },
      }).ok,
    ).toBe(true);
    expect(parseClientEvent({ ...clientEvent, correlationId: id }).ok).toBe(true);
    expect(
      ChatbotRequestSchema.safeParse({
        v: 1,
        sessionId: 's',
        correlationId: id,
        event: { ...clientEvent, correlationId: id },
      }).success,
    ).toBe(true);
  });
});
