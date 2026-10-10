import { serializeChatbotLine } from '@seguradora/protocol';
import { describe, expect, it } from 'vitest';
import { ChatbotProtocolError } from '../application/errors';
import { unsequencedText } from '../test/fixtures';
import { parseNdjson } from './ndjson';

const streamOf = (...chunks: string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
};

const collect = async (body: ReadableStream<Uint8Array>, max?: number) => {
  const out = [];
  for await (const e of parseNdjson(body, max)) out.push(e);
  return out;
};

describe('parseNdjson', () => {
  it('yields one event per line, in order', async () => {
    const a = serializeChatbotLine(unsequencedText(1));
    const b = serializeChatbotLine(unsequencedText(2));
    const events = await collect(streamOf(a + b));
    expect(events.map((e) => e.id)).toEqual([unsequencedText(1).id, unsequencedText(2).id]);
  });

  it('reassembles lines split across chunks, including inside a multibyte character', async () => {
    const line = serializeChatbotLine(unsequencedText(1, 's1', 'olá, atenção'));
    const bytes = new TextEncoder().encode(line);
    const split = bytes.indexOf(0xc3) + 1;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, split));
        controller.enqueue(bytes.slice(split));
        controller.close();
      },
    });
    const events = await collect(body);
    expect(events[0]?.type === 'message.text' && events[0].payload.text).toBe('olá, atenção');
  });

  it('ignores blank lines and parses a last line without a newline', async () => {
    const a = serializeChatbotLine(unsequencedText(1));
    const b = serializeChatbotLine(unsequencedText(2)).trim();
    const events = await collect(streamOf(`\n${a}\n\n`, b));
    expect(events).toHaveLength(2);
  });

  it('throws ChatbotProtocolError for an invalid line', async () => {
    await expect(collect(streamOf('not json\n'))).rejects.toBeInstanceOf(ChatbotProtocolError);
    await expect(collect(streamOf('{"type":"nope"}\n'))).rejects.toBeInstanceOf(
      ChatbotProtocolError,
    );
  });

  it('keeps line content out of the ChatbotProtocolError message', async () => {
    const line = '{"v":1,"type":"message.text","payload":{"text":"SEGREDO-123"}}\n';
    const error: unknown = await collect(streamOf(line)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ChatbotProtocolError);
    expect((error as Error).message).not.toContain('SEGREDO-123');
  });

  it('throws ChatbotProtocolError when a line exceeds the size cap', async () => {
    await expect(collect(streamOf('x'.repeat(200)), 100)).rejects.toBeInstanceOf(
      ChatbotProtocolError,
    );
  });

  it('yields nothing for an empty body', async () => {
    expect(await collect(streamOf())).toEqual([]);
  });
});
