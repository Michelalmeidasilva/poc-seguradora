export class BulkheadFullError extends Error {
  constructor() {
    super('Bulkhead is full');
    this.name = 'BulkheadFullError';
  }
}

export class Bulkhead {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly o: { maxConcurrent: number; maxQueue: number }) {
    if (!Number.isInteger(o.maxConcurrent) || o.maxConcurrent < 1) {
      throw new RangeError(
        `Bulkhead: maxConcurrent must be an integer >= 1, got ${o.maxConcurrent}`,
      );
    }
    if (!Number.isInteger(o.maxQueue) || o.maxQueue < 0) {
      throw new RangeError(`Bulkhead: maxQueue must be an integer >= 0, got ${o.maxQueue}`);
    }
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active < this.o.maxConcurrent) {
      this.active++;
    } else {
      if (this.queue.length >= this.o.maxQueue) throw new BulkheadFullError();
      // The slot is handed over by the call that finishes, so `active` stays counted.
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }

    try {
      return await fn();
    } finally {
      const next = this.queue.shift();
      if (next) next();
      else this.active--;
    }
  }
}
