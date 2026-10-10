import { describe, expect, it, vi } from 'vitest';
import { unsequencedText } from '../test/fixtures';
import { SessionState } from './session-state';

const make = () => new SessionState('s1', { bufferCapacity: 10, seenCapacity: 10 });

describe('SessionState', () => {
  it('publishes sequenced events to subscribers in order', () => {
    const session = make();
    const listener = vi.fn();
    session.subscribe(listener);
    session.publish(unsequencedText(1));
    session.publish(unsequencedText(2));
    expect(listener.mock.calls.map(([e]) => e.seq)).toEqual([1, 2]);
  });

  it('stops notifying after unsubscribe and tracks the listener count', () => {
    const session = make();
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);
    expect(session.listenerCount).toBe(1);
    unsubscribe();
    expect(session.listenerCount).toBe(0);
    session.publish(unsequencedText(1));
    expect(listener).not.toHaveBeenCalled();
  });

  it('buffers events published without subscribers for later replay', () => {
    const session = make();
    session.publish(unsequencedText(1));
    session.publish(unsequencedText(2));
    expect(session.replayAfter(0).events.map((e) => e.seq)).toEqual([1, 2]);
  });

  it('trims acknowledged events', () => {
    const session = make();
    session.publish(unsequencedText(1));
    session.publish(unsequencedText(2));
    session.acknowledge(1);
    expect(session.replayAfter(1).events.map((e) => e.seq)).toEqual([2]);
  });

  it('detects duplicate event ids and allows them again after forgetEvent', () => {
    const session = make();
    expect(session.registerEvent('a')).toBe('new');
    expect(session.registerEvent('a')).toBe('duplicate');
    session.forgetEvent('a');
    expect(session.registerEvent('a')).toBe('new');
  });

  it('exposes the session id', () => {
    expect(make().sessionId).toBe('s1');
  });

  describe('enqueueTurn', () => {
    const deferred = () => {
      let resolve!: () => void;
      let reject!: (e: unknown) => void;
      const promise = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
    const tick = () => new Promise((r) => setTimeout(r, 0));

    it('runs tasks strictly one at a time in FIFO order', async () => {
      const session = make();
      const log: string[] = [];
      const gates = [deferred(), deferred(), deferred()];
      gates.forEach((gate, i) => {
        const r = session.enqueueTurn(async () => {
          log.push(`start ${i}`);
          await gate.promise;
          log.push(`end ${i}`);
        }, 5);
        expect(r).toBe('queued');
      });
      await tick();
      expect(log).toEqual(['start 0']);
      gates[0]?.resolve();
      await tick();
      expect(log).toEqual(['start 0', 'end 0', 'start 1']);
      gates[1]?.resolve();
      gates[2]?.resolve();
      await tick();
      expect(log).toEqual(['start 0', 'end 0', 'start 1', 'end 1', 'start 2', 'end 2']);
    });

    it('returns full without running the task when running plus waiting reaches the cap', async () => {
      const session = make();
      const gate = deferred();
      const ran = vi.fn();
      expect(session.enqueueTurn(() => gate.promise, 2)).toBe('queued');
      expect(session.enqueueTurn(async () => ran('second'), 2)).toBe('queued');
      expect(session.enqueueTurn(async () => ran('third'), 2)).toBe('full');
      gate.resolve();
      await tick();
      expect(ran.mock.calls).toEqual([['second']]);
      // Capacity is released as tasks settle.
      expect(session.enqueueTurn(async () => ran('fourth'), 2)).toBe('queued');
      await tick();
      expect(ran.mock.calls).toEqual([['second'], ['fourth']]);
    });

    it('does not stall the queue when a task rejects', async () => {
      const session = make();
      const ran = vi.fn();
      session.enqueueTurn(() => Promise.reject(new Error('boom')), 3);
      session.enqueueTurn(async () => ran(), 3);
      await tick();
      expect(ran).toHaveBeenCalledTimes(1);
      expect(session.enqueueTurn(async () => ran(), 1)).toBe('queued');
    });
  });
});
