import type { UnsequencedServerEvent } from '@seguradora/protocol';

/**
 * Everything one turn (one `event.id`) produced. The turn writes into it; any number of
 * consumers read it, including ones that arrive while the turn is still running or after it
 * has finished. That is what makes a repeated `event.id` idempotent.
 */
export class TurnRecord {
  private readonly events: UnsequencedServerEvent[] = [];
  private finished = false;
  private waiters: Array<() => void> = [];

  get isFinished(): boolean {
    return this.finished;
  }

  get size(): number {
    return this.events.length;
  }

  push(event: UnsequencedServerEvent): void {
    if (this.finished) throw new Error('TurnRecord: cannot push after finish');
    this.events.push(event);
    this.wake();
  }

  finish(): void {
    this.finished = true;
    this.wake();
  }

  async *stream(): AsyncGenerator<UnsequencedServerEvent> {
    let index = 0;
    for (;;) {
      for (let e = this.events[index]; e !== undefined; e = this.events[index]) {
        index++;
        yield e;
      }
      if (this.finished) return;
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
  }

  private wake(): void {
    const waiting = this.waiters;
    this.waiters = [];
    for (const resolve of waiting) resolve();
  }
}

/** Bounded map of event id → record (oldest ids are forgotten first). */
export class TurnLog {
  private readonly records = new Map<string, TurnRecord>();

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`TurnLog: capacity must be an integer >= 1, got ${capacity}`);
    }
  }

  begin(eventId: string): { record: TurnRecord; created: boolean } {
    const existing = this.records.get(eventId);
    if (existing) return { record: existing, created: false };
    const record = new TurnRecord();
    this.records.set(eventId, record);
    if (this.records.size > this.capacity) {
      const oldest = this.records.keys().next().value;
      if (oldest !== undefined) this.records.delete(oldest);
    }
    return { record, created: true };
  }
}
