import type { UnsequencedServerEvent } from '@seguradora/protocol';
import { describe, expect, it } from 'vitest';
import { TurnLog, TurnRecord } from './turn-log';

const event = (n: number): UnsequencedServerEvent => ({
  v: 1,
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  sessionId: 's1',
  correlationId: 'c1',
  ts: '2026-10-10T12:00:00.000Z',
  type: 'message.text',
  payload: { text: `m${n}` },
});

const collect = async (gen: AsyncIterable<UnsequencedServerEvent>) => {
  const out: string[] = [];
  for await (const e of gen) out.push(e.id.slice(-2));
  return out;
};

describe('TurnRecord', () => {
  it('replays what was recorded after the turn finished', async () => {
    const record = new TurnRecord();
    record.push(event(1));
    record.push(event(2));
    record.finish();
    expect(await collect(record.stream())).toEqual(['01', '02']);
    expect(await collect(record.stream())).toEqual(['01', '02']);
  });

  it('yields nothing for a finished empty turn', async () => {
    const record = new TurnRecord();
    record.finish();
    expect(await collect(record.stream())).toEqual([]);
    expect(record.isFinished).toBe(true);
  });

  it('follows events pushed while it is consuming, until finish', async () => {
    const record = new TurnRecord();
    const consumed = collect(record.stream());
    record.push(event(1));
    await new Promise((r) => setTimeout(r, 10));
    record.push(event(2));
    await new Promise((r) => setTimeout(r, 10));
    record.finish();
    expect(await consumed).toEqual(['01', '02']);
  });

  it('gives several consumers the same sequence, whenever they join', async () => {
    const record = new TurnRecord();
    record.push(event(1));
    const early = collect(record.stream());
    record.push(event(2));
    const late = collect(record.stream());
    record.push(event(3));
    record.finish();
    expect(await early).toEqual(['01', '02', '03']);
    expect(await late).toEqual(['01', '02', '03']);
  });

  it('is not affected by a consumer that stops early', async () => {
    const record = new TurnRecord();
    record.push(event(1));
    record.push(event(2));
    const abandoned = record.stream();
    await abandoned.next();
    await abandoned.return(undefined);
    record.finish();
    expect(await collect(record.stream())).toEqual(['01', '02']);
  });

  it('refuses events after finish', () => {
    const record = new TurnRecord();
    record.finish();
    expect(() => record.push(event(1))).toThrow();
  });

  it('counts its events', () => {
    const record = new TurnRecord();
    record.push(event(1));
    expect(record.size).toBe(1);
  });
});

describe('TurnLog', () => {
  it('creates a record once per key and returns the same record afterwards', () => {
    const log = new TurnLog(10);
    const first = log.begin('a');
    const second = log.begin('a');
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.record).toBe(first.record);
    expect(log.begin('b').record).not.toBe(first.record);
  });

  it('forgets the oldest ids beyond capacity', () => {
    const log = new TurnLog(2);
    const a = log.begin('a').record;
    log.begin('b');
    log.begin('c');
    const again = log.begin('a');
    expect(again.created).toBe(true);
    expect(again.record).not.toBe(a);
    expect(log.begin('c').created).toBe(false);
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects capacity %s', (capacity) => {
    expect(() => new TurnLog(capacity)).toThrow(RangeError);
  });
});
