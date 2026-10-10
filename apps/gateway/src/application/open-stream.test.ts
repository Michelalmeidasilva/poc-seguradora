import { describe, expect, it, vi } from 'vitest';
import { SessionState } from '../domain/session-state';
import { unsequencedText } from '../test/fixtures';
import { openStream } from './open-stream';

const make = () => new SessionState('s1', { bufferCapacity: 3, seenCapacity: 10 });

describe('openStream', () => {
  it('replays buffered events after lastSeq and then streams live events in order', () => {
    const session = make();
    session.publish(unsequencedText(1));
    session.publish(unsequencedText(2));
    const sink = vi.fn();
    openStream(session, 1, sink);
    session.publish(unsequencedText(3));
    expect(sink.mock.calls.map(([e]) => e.seq)).toEqual([2, 3]);
  });

  it('reports a gap when the requested events were evicted', () => {
    const session = make();
    [1, 2, 3, 4, 5].forEach((n) => session.publish(unsequencedText(n)));
    const handle = openStream(session, 0, vi.fn());
    expect(handle.gap).toBe(true);
  });

  it('stops delivering after unsubscribe', () => {
    const session = make();
    const sink = vi.fn();
    const handle = openStream(session, 0, sink);
    handle.unsubscribe();
    session.publish(unsequencedText(1));
    expect(sink).not.toHaveBeenCalled();
    expect(session.listenerCount).toBe(0);
  });
});
