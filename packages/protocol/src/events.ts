import { z } from 'zod';
import { err, ok, type Result } from './result';
import {
  CarouselPayload,
  CodePayload,
  DeliveredPayload,
  ErrorPayload,
  FlowPayload,
  LocationPayload,
  QuickRepliesPayload,
  ReadPayload,
  TemplatePayload,
  TextPayload,
  TypingPayload,
  VoicePayload,
} from './payloads';
import {
  UserAckPayload,
  UserFlowDataExchangePayload,
  UserFlowSubmitPayload,
  UserQuickReplyPayload,
  UserTextPayload,
  UserTypingPayload,
  UserVoicePayload,
} from './client-payloads';

const common = {
  v: z.literal(1),
  id: z.string().uuid(),
  sessionId: z.string().min(1),
  correlationId: z.string().min(1),
  ts: z.string().datetime(),
};

const serverBase = z.object({ ...common, seq: z.number().int().nonnegative() });
const clientBase = z.object(common);

const server = <T extends string, P extends z.ZodTypeAny>(type: T, payload: P) =>
  serverBase.extend({ type: z.literal(type), payload });

const client = <T extends string, P extends z.ZodTypeAny>(type: T, payload: P) =>
  clientBase.extend({ type: z.literal(type), payload });

export const ServerEventSchema = z.discriminatedUnion('type', [
  server('message.text', TextPayload),
  server('message.voice', VoicePayload),
  server('message.code', CodePayload),
  server('message.location', LocationPayload),
  server('message.template', TemplatePayload),
  server('message.carousel', CarouselPayload),
  server('message.quick_replies', QuickRepliesPayload),
  server('message.flow', FlowPayload),
  server('status.typing', TypingPayload),
  server('status.delivered', DeliveredPayload),
  server('status.read', ReadPayload),
  server('error', ErrorPayload),
]);

export const ClientEventSchema = z.discriminatedUnion('type', [
  client('user.text', UserTextPayload),
  client('user.voice', UserVoicePayload),
  client('user.quick_reply', UserQuickReplyPayload),
  client('user.flow_submit', UserFlowSubmitPayload),
  client('user.flow_data_exchange', UserFlowDataExchangePayload),
  client('user.typing', UserTypingPayload),
  client('user.ack', UserAckPayload),
]);

export type ServerEvent = z.infer<typeof ServerEventSchema>;
export type ClientEvent = z.infer<typeof ClientEventSchema>;

export function parseServerEvent(input: unknown): Result<ServerEvent, z.ZodError> {
  const r = ServerEventSchema.safeParse(input);
  return r.success ? ok(r.data) : err(r.error);
}

export function parseClientEvent(input: unknown): Result<ClientEvent, z.ZodError> {
  const r = ClientEventSchema.safeParse(input);
  return r.success ? ok(r.data) : err(r.error);
}
