import { LIMITS, parseChatbotLine, type UnsequencedServerEvent } from '@seguradora/protocol';
import { ChatbotProtocolError } from '../application/errors';

/**
 * The message is logged by the application layer, so it must never carry line content
 * (ZodError messages echo values). Only the location and kind of the failure are kept.
 */
const describeFailure = (error: unknown): string => {
  const issue = (error as { issues?: { path: PropertyKey[]; code: string }[] } | null)?.issues?.[0];
  if (!issue) return 'invalid chatbot line: not valid JSON';
  const path = issue.path.map(String).join('.');
  return `invalid chatbot line: schema mismatch${path ? ` at ${path}` : ''} (${issue.code})`;
};

const toEvent = (line: string): UnsequencedServerEvent => {
  const r = parseChatbotLine(line);
  if (!r.ok) throw new ChatbotProtocolError(describeFailure(r.error));
  return r.value;
};

/** Parses an NDJSON response body into server events, one per line. */
export async function* parseNdjson(
  body: ReadableStream<Uint8Array>,
  maxLineBytes: number = LIMITS.maxEventBytes * 4,
): AsyncGenerator<UnsequencedServerEvent> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) yield toEvent(line);
        newline = buffer.indexOf('\n');
      }
      if (buffer.length > maxLineBytes) {
        throw new ChatbotProtocolError(`chatbot line exceeds ${maxLineBytes} characters`);
      }
    }
    buffer += decoder.decode();
    const tail = buffer.trim();
    if (tail) yield toEvent(tail);
  } finally {
    // Best effort: release the connection; the original outcome is what matters.
    await reader.cancel().catch(() => undefined);
  }
}
