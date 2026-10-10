import type { Clock, IdGenerator, SessionRegistry } from '../application/ports';
import { SessionState } from '../domain/session-state';

export interface RegistryOptions {
  maxSessions: number;
  ttlMs: number;
  bufferCapacity: number;
  seenCapacity: number;
  newId: IdGenerator;
  now: Clock;
}

interface Entry {
  state: SessionState;
  lastSeen: number;
}

export class InMemorySessionRegistry implements SessionRegistry {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly o: RegistryOptions) {}

  get size(): number {
    return this.entries.size;
  }

  create(): SessionState | undefined {
    if (this.entries.size >= this.o.maxSessions) this.sweep();
    if (this.entries.size >= this.o.maxSessions) return undefined;
    const state = new SessionState(this.o.newId(), {
      bufferCapacity: this.o.bufferCapacity,
      seenCapacity: this.o.seenCapacity,
    });
    this.entries.set(state.sessionId, { state, lastSeen: this.o.now() });
    return state;
  }

  get(sessionId: string): SessionState | undefined {
    const entry = this.entries.get(sessionId);
    if (!entry) return undefined;
    const t = this.o.now();
    if (t - entry.lastSeen > this.o.ttlMs) {
      this.entries.delete(sessionId);
      return undefined;
    }
    entry.lastSeen = t;
    return entry.state;
  }

  touch(sessionId: string): void {
    this.get(sessionId);
  }

  /** Forgets a session immediately; returns whether it existed. */
  remove(sessionId: string): boolean {
    return this.entries.delete(sessionId);
  }

  /** Removes idle sessions; returns how many were removed. */
  sweep(): number {
    const t = this.o.now();
    let removed = 0;
    for (const [id, entry] of this.entries) {
      if (t - entry.lastSeen > this.o.ttlMs) {
        this.entries.delete(id);
        removed++;
      }
    }
    return removed;
  }
}
