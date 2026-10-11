import type { ServerEvent } from '@seguradora/protocol';

export const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const base = (seq: number, id: number) => ({
  v: 1 as const,
  id: uuid(id),
  seq,
  sessionId: 's1',
  correlationId: 'c1',
  ts: '2026-10-10T12:00:00.000Z',
});

export const botText = (seq: number, text = `m${seq}`, id = seq): ServerEvent => ({
  ...base(seq, id),
  type: 'message.text',
  payload: { text },
});

export const quickReplies = (seq: number, id = seq): ServerEvent => ({
  ...base(seq, id),
  type: 'message.quick_replies',
  payload: {
    text: 'Escolha',
    options: [
      { id: 'menu.quote', title: 'Fazer cotação' },
      { id: 'menu.policies', title: 'Minhas apólices' },
    ],
  },
});

export const typing = (seq: number, state: 'start' | 'stop', id = 500 + seq): ServerEvent => ({
  ...base(seq, id),
  type: 'status.typing',
  payload: { state },
});

export const delivered = (seq: number, messageId: string, id = 600 + seq): ServerEvent => ({
  ...base(seq, id),
  type: 'status.delivered',
  payload: { messageId },
});

export const errorEvent = (
  seq: number,
  code: 'upstream_unavailable' | 'internal_error' | 'rate_limited',
  messageId?: string,
  id = 700 + seq,
): ServerEvent => ({
  ...base(seq, id),
  type: 'error',
  payload: { code, message: 'Falhou', ...(messageId ? { messageId } : {}) },
});
