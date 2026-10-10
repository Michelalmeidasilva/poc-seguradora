import { describe, expect, it } from 'vitest';
import { unsequencedText } from '../test/fixtures';
import { EventBuffer } from './event-buffer';

describe('EventBuffer', () => {
  it('assigns increasing seq starting at 1 and keeps the event fields', () => {
    const buffer = new EventBuffer(10);
    const first = buffer.append(unsequencedText(1));
    const second = buffer.append(unsequencedText(2));
    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
    expect(first.type).toBe('message.text');
    expect(first.id).toBe(unsequencedText(1).id);
    expect(buffer.latestSeq).toBe(2);
  });

  it('replays only events after lastSeq', () => {
    const buffer = new EventBuffer(10);
    [1, 2, 3].forEach((n) => buffer.append(unsequencedText(n)));
    const r = buffer.replayAfter(1);
    expect(r.events.map((e) => e.seq)).toEqual([2, 3]);
    expect(r.gap).toBe(false);
  });

  it('replays everything for a new client of a new session without a gap', () => {
    const buffer = new EventBuffer(10);
    expect(buffer.replayAfter(0)).toEqual({ events: [], gap: false });
    buffer.append(unsequencedText(1));
    expect(buffer.replayAfter(0).events).toHaveLength(1);
    expect(buffer.replayAfter(0).gap).toBe(false);
  });

  it('evicts the oldest events beyond capacity and reports a gap', () => {
    const buffer = new EventBuffer(3);
    [1, 2, 3, 4, 5].forEach((n) => buffer.append(unsequencedText(n)));
    const r = buffer.replayAfter(0);
    expect(r.events.map((e) => e.seq)).toEqual([3, 4, 5]);
    expect(r.gap).toBe(true);
    expect(buffer.replayAfter(2).gap).toBe(false);
  });

  it('returns nothing and no gap when the client is ahead of the buffer', () => {
    const buffer = new EventBuffer(10);
    buffer.append(unsequencedText(1));
    expect(buffer.replayAfter(99)).toEqual({ events: [], gap: false });
  });

  it('drops acknowledged events and reports a gap for older clients', () => {
    const buffer = new EventBuffer(10);
    [1, 2, 3].forEach((n) => buffer.append(unsequencedText(n)));
    buffer.trimThrough(2);
    expect(buffer.replayAfter(2).events.map((e) => e.seq)).toEqual([3]);
    expect(buffer.replayAfter(0).gap).toBe(true);
  });

  it('keeps counting seq after events were trimmed', () => {
    const buffer = new EventBuffer(10);
    buffer.append(unsequencedText(1));
    buffer.trimThrough(1);
    expect(buffer.append(unsequencedText(2)).seq).toBe(2);
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects capacity %s', (capacity) => {
    expect(() => new EventBuffer(capacity)).toThrow(RangeError);
  });
});
