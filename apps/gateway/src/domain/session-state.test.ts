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
});
