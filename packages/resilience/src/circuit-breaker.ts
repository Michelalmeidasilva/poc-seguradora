export class CircuitOpenError extends Error {
  constructor() {
    super('Circuit breaker is open');
    this.name = 'CircuitOpenError';
  }
}

export type BreakerState = 'closed' | 'open' | 'half_open';

export interface BreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
  now?: () => number;
  isFailure?: (err: unknown) => boolean;
}

export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private opened = false;
  private probing = false;
  private readonly now: () => number;
  private readonly isFailure: (err: unknown) => boolean;

  constructor(private readonly o: BreakerOptions) {
    this.now = o.now ?? Date.now;
    this.isFailure = o.isFailure ?? (() => true);
  }

  get state(): BreakerState {
    if (!this.opened) return 'closed';
    return this.now() - this.openedAt >= this.o.resetTimeoutMs ? 'half_open' : 'open';
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.state;
    if (state === 'open') throw new CircuitOpenError();
    if (state === 'half_open') {
      if (this.probing) throw new CircuitOpenError();
      this.probing = true;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      if (this.isFailure(error)) this.onFailure(state === 'half_open');
      else this.onSuccess();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.opened = false;
    this.probing = false;
  }

  private onFailure(wasProbe: boolean): void {
    this.failures++;
    if (wasProbe || this.failures >= this.o.failureThreshold) {
      this.opened = true;
      this.openedAt = this.now();
      this.probing = false;
    }
  }
}
