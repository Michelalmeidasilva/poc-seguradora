import type { ServerEvent, UnsequencedServerEvent } from '@seguradora/protocol';

export interface Replay {
  events: ServerEvent[];
  /** True when events between the client's last seq and the oldest buffered event are gone. */
  gap: boolean;
}

/** Per-session ring of the most recent server events, with monotonic `seq` starting at 1. */
export class EventBuffer {
  private events: ServerEvent[] = [];
  private nextSeq = 1;

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`EventBuffer: capacity must be an integer >= 1, got ${capacity}`);
    }
  }

  get latestSeq(): number {
    return this.nextSeq - 1;
  }

  append(event: UnsequencedServerEvent): ServerEvent {
    const sequenced = { ...event, seq: this.nextSeq++ } as ServerEvent;
    this.events.push(sequenced);
    if (this.events.length > this.capacity) this.events.shift();
    return sequenced;
  }

  replayAfter(lastSeq: number): Replay {
    const events = this.events.filter((e) => e.seq > lastSeq);
    const firstSeq = this.events[0]?.seq ?? this.nextSeq;
    return { events, gap: firstSeq > lastSeq + 1 };
  }

  /** Drops events the client has acknowledged. */
  trimThrough(lastSeq: number): void {
    this.events = this.events.filter((e) => e.seq > lastSeq);
  }
}
