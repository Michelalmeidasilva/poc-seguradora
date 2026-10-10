import type { ServerEvent } from '@seguradora/protocol';
import type { SessionState } from '../domain/session-state';

export interface StreamHandle {
  /** True when some events after `lastSeq` are no longer buffered. */
  gap: boolean;
  unsubscribe: () => void;
}

/**
 * Replays the buffered events after `lastSeq` and then subscribes to live ones. Both
 * happen synchronously, so no event published in between can be missed or duplicated.
 */
export function openStream(
  session: SessionState,
  lastSeq: number,
  sink: (event: ServerEvent) => void,
): StreamHandle {
  const { events, gap } = session.replayAfter(lastSeq);
  for (const event of events) sink(event);
  const unsubscribe = session.subscribe(sink);
  return { gap, unsubscribe };
}
