import { describe, expect, it } from 'vitest';
import { Bulkhead, BulkheadFullError } from './bulkhead';

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

describe('Bulkhead', () => {
  it('runs calls up to maxConcurrent in parallel', async () => {
    const bulkhead = new Bulkhead({ maxConcurrent: 2, maxQueue: 0 });
    const a = deferred<string>();
    const b = deferred<string>();
    const pa = bulkhead.execute(() => a.promise);
    const pb = bulkhead.execute(() => b.promise);
    a.resolve('a');
    b.resolve('b');
    await expect(Promise.all([pa, pb])).resolves.toEqual(['a', 'b']);
  });

  it('queues calls above maxConcurrent and runs them when a slot frees', async () => {
    const bulkhead = new Bulkhead({ maxConcurrent: 1, maxQueue: 1 });
    const first = deferred<string>();
    const order: string[] = [];
    const p1 = bulkhead.execute(async () => {
      order.push('first-start');
      return first.promise;
    });
    const p2 = bulkhead.execute(async () => {
      order.push('second-start');
      return 'second';
    });
    await Promise.resolve();
    expect(order).toEqual(['first-start']);
    first.resolve('first');
    await expect(p1).resolves.toBe('first');
    await expect(p2).resolves.toBe('second');
    expect(order).toEqual(['first-start', 'second-start']);
  });

  it('rejects with BulkheadFullError when running and queue are full', async () => {
    const bulkhead = new Bulkhead({ maxConcurrent: 1, maxQueue: 1 });
    const gate = deferred<string>();
    const p1 = bulkhead.execute(() => gate.promise);
    const p2 = bulkhead.execute(async () => 'queued');
    await expect(bulkhead.execute(async () => 'x')).rejects.toBeInstanceOf(BulkheadFullError);
    gate.resolve('ok');
    await Promise.all([p1, p2]);
  });

  it('rejects immediately when maxQueue is 0 and all slots are busy', async () => {
    const bulkhead = new Bulkhead({ maxConcurrent: 1, maxQueue: 0 });
    const gate = deferred<string>();
    const p1 = bulkhead.execute(() => gate.promise);
    await expect(bulkhead.execute(async () => 'x')).rejects.toBeInstanceOf(BulkheadFullError);
    gate.resolve('ok');
    await p1;
  });

  it('frees the slot when the function fails', async () => {
    const bulkhead = new Bulkhead({ maxConcurrent: 1, maxQueue: 0 });
    await expect(
      bulkhead.execute(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await expect(bulkhead.execute(async () => 'after')).resolves.toBe('after');
  });
});

describe('Bulkhead input guards', () => {
  it.each([0, 1.5, NaN, -1])('rejects maxConcurrent %s', (maxConcurrent) => {
    expect(() => new Bulkhead({ maxConcurrent, maxQueue: 0 })).toThrow(RangeError);
  });
  it.each([-1, 1.5, NaN, Infinity])('rejects maxQueue %s', (maxQueue) => {
    expect(() => new Bulkhead({ maxConcurrent: 1, maxQueue })).toThrow(RangeError);
  });
});
