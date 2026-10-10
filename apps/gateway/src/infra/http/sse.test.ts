import { describe, expect, it } from 'vitest';
import { unsequencedText } from '../../test/fixtures';
import { formatSseEvent, parseLastEventId } from './sse';

describe('formatSseEvent', () => {
  it('writes id, event and a single-line JSON data block', () => {
    const event = { ...unsequencedText(1), seq: 7 } as Parameters<typeof formatSseEvent>[0];
    const out = formatSseEvent(event);
    expect(out.startsWith('id: 7\nevent: message.text\ndata: ')).toBe(true);
    expect(out.endsWith('\n\n')).toBe(true);
    const data = out.split('\n')[2]?.slice('data: '.length) ?? '';
    expect(JSON.parse(data)).toEqual(event);
  });

  it('keeps newlines inside the text on one data line', () => {
    const event = {
      ...unsequencedText(1, 's1', 'linha 1\nlinha 2'),
      seq: 1,
    } as Parameters<typeof formatSseEvent>[0];
    const out = formatSseEvent(event);
    expect(out.split('\n').filter((l) => l.startsWith('data:'))).toHaveLength(1);
  });
});

describe('parseLastEventId', () => {
  it.each([
    ['5', 5],
    ['0', 0],
    [undefined, 0],
    ['', 0],
    ['abc', 0],
    ['-3', 0],
    ['1.5', 0],
    ['99999999999999999999', 0],
  ])('parses %j as %d', (input, expected) => {
    expect(parseLastEventId(input)).toBe(expected);
  });

  it('uses the first value when the header repeats', () => {
    expect(parseLastEventId(['4', '9'])).toBe(4);
  });
});
