import { z } from 'zod';
import { ClientEventSchema, ServerEventSchema } from './events';
import { err, ok, type Result } from './result';

/** Gateway → chatbot: body of `POST /v1/chat/events`. */
export const ChatbotRequestSchema = z.object({
  v: z.literal(1),
  sessionId: z.string().min(1).max(128),
  correlationId: z.string().min(1).max(128),
  event: ClientEventSchema,
});
export type ChatbotRequest = z.infer<typeof ChatbotRequestSchema>;

const [
  text,
  voice,
  code,
  location,
  template,
  carousel,
  quickReplies,
  flow,
  typing,
  delivered,
  read,
  error,
] = ServerEventSchema.options;

/** A server event as the chatbot emits it: the gateway assigns `seq`. */
export const UnsequencedServerEventSchema = z.discriminatedUnion('type', [
  text.omit({ seq: true }),
  voice.omit({ seq: true }),
  code.omit({ seq: true }),
  location.omit({ seq: true }),
  template.omit({ seq: true }),
  carousel.omit({ seq: true }),
  quickReplies.omit({ seq: true }),
  flow.omit({ seq: true }),
  typing.omit({ seq: true }),
  delivered.omit({ seq: true }),
  read.omit({ seq: true }),
  error.omit({ seq: true }),
]);
export type UnsequencedServerEvent = z.infer<typeof UnsequencedServerEventSchema>;

/** Parses one NDJSON line of the chatbot response. */
export function parseChatbotLine(line: string): Result<UnsequencedServerEvent, Error> {
  let json: unknown;
  try {
    json = JSON.parse(line);
  } catch {
    return err(new Error('chatbot line is not valid JSON'));
  }
  const r = UnsequencedServerEventSchema.safeParse(json);
  return r.success ? ok(r.data) : err(r.error);
}

export function serializeChatbotLine(event: UnsequencedServerEvent): string {
  return `${JSON.stringify(event)}\n`;
}
