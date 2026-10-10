/** Bounded set of recently seen event ids (oldest forgotten first). */
export class IdempotencyCache {
  private readonly ids = new Set<string>();

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`IdempotencyCache: capacity must be an integer >= 1, got ${capacity}`);
    }
  }

  /** Registers the id; returns true when it had already been registered. */
  register(id: string): boolean {
    if (this.ids.has(id)) return true;
    this.ids.add(id);
    if (this.ids.size > this.capacity) {
      const oldest = this.ids.values().next().value;
      if (oldest !== undefined) this.ids.delete(oldest);
    }
    return false;
  }

  forget(id: string): void {
    this.ids.delete(id);
  }
}
