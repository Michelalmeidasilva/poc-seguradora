import type { Clock, IdGenerator, SessionRegistry } from '../application/ports';
import { SessionState } from '../domain/session-state';

export interface RegistryOptions {
  maxSessions: number;
  /** Idle TTL of a session that already did something (stream or event). */
  ttlMs: number;
  /** Idle TTL of a session that was created but never used. */
  unusedTtlMs: number;
  bufferCapacity: number;
  seenCapacity: number;
  newId: IdGenerator;
  now: Clock;
}

interface Entry {
  state: SessionState;
  lastSeen: number;
  active: boolean;
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
    this.entries.set(state.sessionId, { state, lastSeen: this.o.now(), active: false });
    return state;
  }

  get(sessionId: string): SessionState | undefined {
    const entry = this.entries.get(sessionId);
    if (!entry) return undefined;
    const t = this.o.now();
    if (this.expired(entry, t)) {
      this.entries.delete(sessionId);
      return undefined;
    }
    entry.lastSeen = t;
    return entry.state;
  }

  markActive(sessionId: string): void {
    const entry = this.entries.get(sessionId);
    if (entry) entry.active = true;
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
      if (this.expired(entry, t)) {
        this.entries.delete(id);
        removed++;
      }
    }
    return removed;
  }

  private expired(entry: Entry, t: number): boolean {
    return t - entry.lastSeen > (entry.active ? this.o.ttlMs : this.o.unusedTtlMs);
  }
}
