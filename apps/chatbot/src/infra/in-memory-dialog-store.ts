import type { Clock, DialogStore } from '../application/ports';
import { IDLE, type DialogState } from '../domain/dialog';

export interface DialogStoreOptions {
  capacity: number;
  ttlMs: number;
  now?: Clock;
}

interface Entry {
  state: DialogState;
  updated: number;
}

export class InMemoryDialogStore implements DialogStore {
  private readonly entries = new Map<string, Entry>();
  private readonly now: Clock;

  constructor(private readonly o: DialogStoreOptions) {
    if (!Number.isInteger(o.capacity) || o.capacity < 1) {
      throw new RangeError(
        `InMemoryDialogStore: capacity must be an integer >= 1, got ${o.capacity}`,
      );
    }
    this.now = o.now ?? Date.now;
  }

  get(sessionId: string): DialogState {
    const entry = this.entries.get(sessionId);
    if (!entry) return IDLE;
    if (this.now() - entry.updated > this.o.ttlMs) {
      this.entries.delete(sessionId);
      return IDLE;
    }
    return entry.state;
  }

  set(sessionId: string, state: DialogState): void {
    this.entries.delete(sessionId);
    this.entries.set(sessionId, { state, updated: this.now() });
    if (this.entries.size > this.o.capacity) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
  }

  /** Removes expired sessions; returns how many were removed. */
  sweep(): number {
    const t = this.now();
    let removed = 0;
    for (const [id, entry] of this.entries) {
      if (t - entry.updated > this.o.ttlMs) {
        this.entries.delete(id);
        removed++;
      }
    }
    return removed;
  }
}
