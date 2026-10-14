import {
  parseChatbotLine,
  type ChatbotRequest,
  type UnsequencedServerEvent,
} from '@seguradora/protocol';
import pino from 'pino';
import type { AddressInfo } from 'node:net';
import { createChatbot, type ChatbotOverrides } from '../compose';
import { loadConfig, type Config } from '../config';
import { startFakeServices, type FakeServices } from './fake-services';

export const testConfig = (url: string, overrides: Record<string, string> = {}): Config => {
  const r = loadConfig({
    COTACAO_URL: url,
    APOLICE_URL: url,
    SINISTRO_URL: url,
    SERVICE_TIMEOUT_MS: '800',
    SERVICE_RETRIES: '1',
    SERVICE_RETRY_BASE_MS: '1',
    SERVICE_RETRY_MAX_MS: '2',
    LOG_LEVEL: 'silent',
    SHUTDOWN_GRACE_MS: '200',
    ...overrides,
  });
  if (!r.ok) throw new Error(`invalid test config: ${r.error.join('; ')}`);
  return r.value;
};

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let counter = 1000;
const ts = '2026-10-10T12:00:00.000Z';

const wrap = (
  event: object,
  sessionId: string,
  correlationId: string,
  id?: string,
): ChatbotRequest =>
  ({
    v: 1,
    sessionId,
    correlationId,
    event: { v: 1, id: id ?? uuid(++counter), sessionId, correlationId, ts, ...event },
  }) as ChatbotRequest;

export const textReq = (text: string, o: { session?: string; corr?: string; id?: string } = {}) =>
  wrap({ type: 'user.text', payload: { text } }, o.session ?? 's1', o.corr ?? 'corr-text', o.id);

export const choiceReq = (optionId: string, o: { session?: string; corr?: string } = {}) =>
  wrap(
    { type: 'user.quick_reply', payload: { optionId, replyToId: uuid(1) } },
    o.session ?? 's1',
    o.corr ?? 'corr-choice',
  );

export const flowSubmitReq = (
  data: Record<string, unknown>,
  o: { session?: string; flowId?: string } = {},
) =>
  wrap(
    { type: 'user.flow_submit', payload: { flowId: o.flowId ?? 'cotacao', data } },
    o.session ?? 's1',
    'corr-flow',
  );

export const voiceReq = (
  durationMs: number,
  o: { session?: string; corr?: string; id?: string; mediaId?: string } = {},
) =>
  wrap(
    { type: 'user.voice', payload: { mediaId: o.mediaId ?? 'm1', durationMs } },
    o.session ?? 's1',
    o.corr ?? 'corr-voice',
    o.id,
  );

export interface RunningChatbot {
  url: string;
  fake: FakeServices;
  screenId(sessionId: string): string | undefined;
  close(): Promise<void>;
}

export async function startChatbot(
  o: { env?: Record<string, string>; overrides?: ChatbotOverrides } = {},
): Promise<RunningChatbot> {
  const fake = await startFakeServices();
  const { app, assistanceStates } = await createChatbot(testConfig(fake.url, o.env), {
    logger: pino({ level: 'silent' }),
    ...o.overrides,
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  return {
    url,
    fake,
    screenId: (sessionId) => assistanceStates.get(sessionId)?.screenId,
    close: async () => {
      await app.close();
      await fake.close();
    },
  };
}

export interface TurnResult {
  status: number;
  headers: Headers;
  /** Time until the response headers arrived (ms). */
  headersAfterMs: number;
  events: UnsequencedServerEvent[];
}

/** POSTs a request like the gateway does and parses every NDJSON line with the protocol schema. */
export async function turn(url: string, request: ChatbotRequest): Promise<TurnResult> {
  const started = Date.now();
  const res = await fetch(`${url}/v1/chat/events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/x-ndjson',
      'x-correlation-id': request.correlationId,
    },
    body: JSON.stringify(request),
  });
  const headersAfterMs = Date.now() - started;
  const body = await res.text();
  const events: UnsequencedServerEvent[] = [];
  for (const line of body.split('\n')) {
    if (!line) continue;
    const parsed = parseChatbotLine(line);
    if (!parsed.ok) throw new Error(`chatbot sent an invalid NDJSON line: ${parsed.error.message}`);
    events.push(parsed.value);
  }
  return { status: res.status, headers: res.headers, headersAfterMs, events };
}

export const typesOf = (events: UnsequencedServerEvent[]) => events.map((e) => e.type);
export const replies = (events: UnsequencedServerEvent[]) =>
  events.filter((e) => e.type !== 'status.typing');
export const textsOf = (events: UnsequencedServerEvent[]) =>
  events.flatMap((e) => (e.type === 'message.text' ? [e.payload.text] : [])).join(' | ');

type EventOf<T extends UnsequencedServerEvent['type']> = Extract<
  UnsequencedServerEvent,
  { type: T }
>;

/** Returns the first event of the given type, or throws naming the types actually received. */
export function findEvent<T extends UnsequencedServerEvent['type']>(
  events: UnsequencedServerEvent[],
  type: T,
): EventOf<T> {
  const found = events.find((e): e is EventOf<T> => e.type === type);
  if (!found) {
    throw new Error(`expected a ${type} event, received: [${typesOf(events).join(', ')}]`);
  }
  return found;
}

export const hasEvent = (events: UnsequencedServerEvent[], type: UnsequencedServerEvent['type']) =>
  events.some((e) => e.type === type);

export const templateButtons = (event: EventOf<'message.template'>) => event.payload.buttons;

export const quickReplyIds = (events: UnsequencedServerEvent[]) =>
  events.flatMap((e) =>
    e.type === 'message.quick_replies' ? e.payload.options.map((o) => o.id) : [],
  );
