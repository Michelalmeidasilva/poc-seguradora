import { describe, expect, it } from 'vitest';
import { createSseParser, type SseMessage } from './sse-parser';

const collect = (chunks: string[]) => {
  const messages: SseMessage[] = [];
  const retries: number[] = [];
  let activity = 0;
  const parser = createSseParser({
    onMessage: (m) => messages.push(m),
    onRetry: (ms) => retries.push(ms),
    onActivity: () => activity++,
  });
  for (const c of chunks) parser.feed(c);
  return { messages, retries, activity: () => activity };
};

describe('createSseParser', () => {
  it('parses id, event and data blocks', () => {
    const { messages } = collect(['id: 7\nevent: message.text\ndata: {"a":1}\n\n']);
    expect(messages).toEqual([{ id: '7', event: 'message.text', data: '{"a":1}' }]);
  });

  it('joins multi-line data with newlines', () => {
    const { messages } = collect(['data: a\ndata: b\n\n']);
    expect(messages).toEqual([{ data: 'a\nb' }]);
  });

  it('reassembles blocks split across arbitrary chunks', () => {
    const text = 'id: 1\nevent: x\ndata: hello\n\nid: 2\ndata: world\n\n';
    for (let cut = 1; cut < text.length; cut++) {
      const { messages } = collect([text.slice(0, cut), text.slice(cut)]);
      expect(messages.map((m) => m.data)).toEqual(['hello', 'world']);
    }
  });

  it('handles CRLF, including a CRLF split between chunks', () => {
    const { messages } = collect(['data: a\r', '\n\r\n', 'data: b\r\n\r\n']);
    expect(messages.map((m) => m.data)).toEqual(['a', 'b']);
  });

  it('ignores comments but reports activity (heartbeat)', () => {
    const { messages, activity } = collect([': hb\n\n']);
    expect(messages).toEqual([]);
    expect(activity()).toBeGreaterThan(0);
  });

  it('reports retry hints and ignores invalid ones', () => {
    const { retries, messages } = collect(['retry: 3000\n\n', 'retry: abc\n\n']);
    expect(retries).toEqual([3000]);
    expect(messages).toEqual([]);
  });

  it('does not dispatch a block without data', () => {
    expect(collect(['id: 5\nevent: x\n\n']).messages).toEqual([]);
  });

  it('keeps the id of one block from leaking into the next', () => {
    const { messages } = collect(['id: 1\ndata: a\n\ndata: b\n\n']);
    expect(messages).toEqual([{ id: '1', data: 'a' }, { data: 'b' }]);
  });

  it('strips only one leading space of the value and tolerates a missing colon', () => {
    const { messages } = collect(['data:  two spaces\n\n', 'data\n\n']);
    expect(messages.map((m) => m.data)).toEqual([' two spaces', '']);
  });

  it('ignores unknown fields', () => {
    expect(collect(['foo: bar\ndata: x\n\n']).messages).toEqual([{ data: 'x' }]);
  });
});
