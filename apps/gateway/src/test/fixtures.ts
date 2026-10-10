import type { ClientEvent, UnsequencedServerEvent } from '@seguradora/protocol';

export const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const ts = '2026-10-10T12:00:00.000Z';

export const unsequencedText = (
  n: number,
  sessionId = 's1',
  text = `m${n}`,
): UnsequencedServerEvent => ({
  v: 1,
  id: uuid(n),
  sessionId,
  correlationId: 'c1',
  ts,
  type: 'message.text',
  payload: { text },
});

export const clientText = (n: number, sessionId = 's1', text = `hello ${n}`): ClientEvent => ({
  v: 1,
  id: uuid(1000 + n),
  sessionId,
  correlationId: `corr-${n}`,
  ts,
  type: 'user.text',
  payload: { text },
});

export const clientAck = (n: number, sessionId: string, lastSeq: number): ClientEvent => ({
  v: 1,
  id: uuid(2000 + n),
  sessionId,
  correlationId: `corr-ack-${n}`,
  ts,
  type: 'user.ack',
  payload: { lastSeq },
});

export const clientTyping = (n: number, sessionId: string): ClientEvent => ({
  v: 1,
  id: uuid(3000 + n),
  sessionId,
  correlationId: `corr-typing-${n}`,
  ts,
  type: 'user.typing',
  payload: { state: 'start' },
});
