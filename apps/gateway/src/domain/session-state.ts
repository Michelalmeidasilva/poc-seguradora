import type { ServerEvent, UnsequencedServerEvent } from '@seguradora/protocol';
import { EventBuffer, type Replay } from './event-buffer';
import { IdempotencyCache } from './idempotency-cache';

export interface SessionStateOptions {
  bufferCapacity: number;
  seenCapacity: number;
}

/** Listeners must not throw: they are called synchronously by `publish`. */
export type Listener = (event: ServerEvent) => void;

/** Everything the gateway remembers about one anonymous session. */
export class SessionState {
  private readonly buffer: EventBuffer;
  private readonly seen: IdempotencyCache;
  private readonly listeners = new Set<Listener>();
  private turnTail: Promise<void> = Promise.resolve();
  private pendingTurns = 0;

  constructor(
    readonly sessionId: string,
    o: SessionStateOptions,
  ) {
    this.buffer = new EventBuffer(o.bufferCapacity);
    this.seen = new IdempotencyCache(o.seenCapacity);
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  publish(event: UnsequencedServerEvent): ServerEvent {
    const sequenced = this.buffer.append(event);
    for (const listener of this.listeners) listener(sequenced);
    return sequenced;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  replayAfter(lastSeq: number): Replay {
    return this.buffer.replayAfter(lastSeq);
  }

  acknowledge(lastSeq: number): void {
    this.buffer.trimThrough(lastSeq);
  }

  registerEvent(id: string): 'new' | 'duplicate' {
    return this.seen.register(id) ? 'duplicate' : 'new';
  }

  forgetEvent(id: string): void {
    this.seen.forget(id);
  }

  /**
   * Runs `task` after every previously queued task settled (FIFO, one at a time).
   * `maxPending` caps running + waiting tasks; beyond it the task is NOT run and 'full' is returned.
   * A rejecting task never breaks the chain.
   */
  enqueueTurn(task: () => Promise<void>, maxPending: number): 'queued' | 'full' {
    if (this.pendingTurns >= maxPending) return 'full';
    this.pendingTurns++;
    const settle = (): void => {
      this.pendingTurns--;
    };
    this.turnTail = this.turnTail.then(task).then(settle, settle);
    return 'queued';
  }
}
