import type { ChatbotRequest, UnsequencedServerEvent } from '@seguradora/protocol';
import { describe, expect, it, vi } from 'vitest';
import { SessionState } from '../domain/session-state';
import { clientAck, clientText, clientTyping, uuid, unsequencedText } from '../test/fixtures';
import { ChatbotHttpError, ChatbotProtocolError } from './errors';
import {
  HandleClientEvent,
  type HandleClientEventDeps,
  type HandleResult,
} from './handle-client-event';
import type { ChatbotPort, Logger, RateLimiter } from './ports';

const allow: RateLimiter = { take: () => ({ allowed: true, retryAfterMs: 0 }) };
const deny = (retryAfterMs: number): RateLimiter => ({
  take: () => ({ allowed: false, retryAfterMs }),
});
const silent: Logger = { info() {}, warn() {}, error() {} };

let counter = 0;
const newId = () => uuid(9000 + ++counter);

async function* stream(...list: UnsequencedServerEvent[]) {
  for (const e of list) yield e;
}

const chatbotReturning = (...list: UnsequencedServerEvent[]) => ({
  send: vi.fn<(request: ChatbotRequest) => Promise<AsyncIterable<UnsequencedServerEvent>>>(
    async () => stream(...list),
  ),
});

const make = (chatbot: ChatbotPort, over: Partial<HandleClientEventDeps> = {}) =>
  new HandleClientEvent({
    chatbot,
    sessionLimiter: allow,
    ipLimiter: allow,
    newId,
    now: () => Date.parse('2026-10-10T12:00:00.000Z'),
    logger: silent,
    ...over,
  });

const makeSession = (id = 's1') => new SessionState(id, { bufferCapacity: 50, seenCapacity: 50 });
const types = (s: SessionState) => s.replayAfter(0).events.map((e) => e.type);

async function accepted(result: HandleResult): Promise<void> {
  if (result.status !== 'accepted') throw new Error(`expected accepted, got ${result.status}`);
  await result.completion;
}

describe('HandleClientEvent', () => {
  it('forwards a text event, then publishes delivered followed by the replies in order', async () => {
    const session = makeSession();
    const chatbot = chatbotReturning(unsequencedText(1), unsequencedText(2));
    const event = clientText(1);
    await accepted(make(chatbot).handle(session, event, '1.1.1.1'));

    expect(chatbot.send).toHaveBeenCalledTimes(1);
    expect(chatbot.send.mock.calls[0]?.[0]).toEqual({
      v: 1,
      sessionId: 's1',
      correlationId: event.correlationId,
      event,
    });
    const published = session.replayAfter(0).events;
    expect(published.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(published.map((e) => e.type)).toEqual([
      'status.delivered',
      'message.text',
      'message.text',
    ]);
    const delivered = published[0];
    expect(delivered?.type === 'status.delivered' && delivered.payload.messageId).toBe(event.id);
  });

  it('does not forward a duplicate event id', async () => {
    const session = makeSession();
    const chatbot = chatbotReturning(unsequencedText(1));
    const handler = make(chatbot);
    await accepted(handler.handle(session, clientText(1), 'ip'));
    expect(handler.handle(session, clientText(1), 'ip')).toEqual({ status: 'duplicate' });
    expect(chatbot.send).toHaveBeenCalledTimes(1);
  });

  it('accepts typing without forwarding it', async () => {
    const session = makeSession();
    const chatbot = chatbotReturning();
    await accepted(make(chatbot).handle(session, clientTyping(1, 's1'), 'ip'));
    expect(chatbot.send).not.toHaveBeenCalled();
    expect(session.replayAfter(0).events).toHaveLength(0);
  });

  it('applies an ack to the buffer without forwarding it', async () => {
    const session = makeSession();
    session.publish(unsequencedText(1));
    const chatbot = chatbotReturning();
    await accepted(make(chatbot).handle(session, clientAck(1, 's1', 1), 'ip'));
    expect(chatbot.send).not.toHaveBeenCalled();
    expect(session.replayAfter(0).events).toHaveLength(0);
  });

  it('publishes upstream_unavailable with the message id when the chatbot cannot be reached', async () => {
    const session = makeSession();
    const chatbot: ChatbotPort = {
      send: vi.fn(async () => {
        throw new ChatbotHttpError(503);
      }),
    };
    const event = clientText(1);
    await accepted(make(chatbot).handle(session, event, 'ip'));
    const [only] = session.replayAfter(0).events;
    expect(only?.type).toBe('error');
    expect(only?.type === 'error' && only.payload.code).toBe('upstream_unavailable');
    expect(only?.type === 'error' && only.payload.messageId).toBe(event.id);
  });

  it('reprocesses a resend of the same id after the upstream failed', async () => {
    const session = makeSession();
    const send = vi
      .fn<(r: ChatbotRequest) => Promise<AsyncIterable<UnsequencedServerEvent>>>()
      .mockRejectedValueOnce(new ChatbotHttpError(503))
      .mockResolvedValueOnce(stream(unsequencedText(1)));
    const handler = make({ send });
    const event = clientText(1);
    await accepted(handler.handle(session, event, 'ip'));
    const second = handler.handle(session, event, 'ip');
    expect(second.status).toBe('accepted');
    await accepted(second);
    expect(send).toHaveBeenCalledTimes(2);
    expect(types(session)).toEqual(['error', 'status.delivered', 'message.text']);
  });

  it('keeps the id registered when the stream fails after delivery and publishes an error', async () => {
    const session = makeSession();
    async function* failing() {
      yield unsequencedText(1);
      throw new Error('connection reset');
    }
    const chatbot: ChatbotPort = { send: vi.fn(async () => failing()) };
    const handler = make(chatbot);
    await accepted(handler.handle(session, clientText(1), 'ip'));
    expect(types(session)).toEqual(['status.delivered', 'message.text', 'error']);
    expect(handler.handle(session, clientText(1), 'ip')).toEqual({ status: 'duplicate' });
  });

  it('maps an invalid chatbot line to internal_error', async () => {
    const session = makeSession();
    async function* broken() {
      yield unsequencedText(1);
      throw new ChatbotProtocolError('bad line');
    }
    const chatbot: ChatbotPort = { send: vi.fn(async () => broken()) };
    await accepted(make(chatbot).handle(session, clientText(1), 'ip'));
    expect(types(session)).toEqual(['status.delivered', 'message.text', 'error']);
    const last = session.replayAfter(0).events.at(-1);
    expect(last?.type === 'error' && last.payload.code).toBe('internal_error');
  });

  it('drops chatbot events that belong to another session', async () => {
    const session = makeSession('s1');
    const chatbot = chatbotReturning(unsequencedText(1, 'other-session'), unsequencedText(2, 's1'));
    await accepted(make(chatbot).handle(session, clientText(1), 'ip'));
    expect(types(session)).toEqual(['status.delivered', 'message.text']);
  });

  it('rejects with rate_limited when the session limiter denies, without registering the id', async () => {
    const session = makeSession();
    const chatbot = chatbotReturning(unsequencedText(1));
    const limited = make(chatbot, { sessionLimiter: deny(1500) });
    expect(limited.handle(session, clientText(1), 'ip')).toEqual({
      status: 'rate_limited',
      retryAfterMs: 1500,
    });
    expect(chatbot.send).not.toHaveBeenCalled();
    const open = make(chatbot);
    await accepted(open.handle(session, clientText(1), 'ip'));
    expect(chatbot.send).toHaveBeenCalledTimes(1);
  });

  it('rejects with rate_limited when the ip limiter denies and reports the larger wait', () => {
    const session = makeSession();
    const chatbot = chatbotReturning();
    const handler = make(chatbot, { ipLimiter: deny(4000), sessionLimiter: deny(1000) });
    expect(handler.handle(session, clientText(1), 'ip')).toEqual({
      status: 'rate_limited',
      retryAfterMs: 4000,
    });
  });
});
