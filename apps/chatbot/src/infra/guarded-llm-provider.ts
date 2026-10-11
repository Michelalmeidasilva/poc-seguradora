import { withTimeout } from '@seguradora/resilience';
import type { LlmProvider, Logger } from '../application/ports';
import type { Intent } from '../domain/dialog';

const INTENT_NAMES = new Set([
  'greeting',
  'quote',
  'policies',
  'claim',
  'claim_status',
  'location',
  'help',
  'cancel',
  'unknown',
]);

export interface GuardedLlmOptions {
  timeoutMs: number;
  /** Longer inputs are truncated before they reach the provider (cost and abuse control). */
  maxInputChars: number;
  logger: Logger;
}

const FALLBACK: Intent = { name: 'unknown', entities: {} };

const isIntent = (v: unknown): v is Intent =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as Intent).name === 'string' &&
  INTENT_NAMES.has((v as Intent).name) &&
  typeof (v as Intent).entities === 'object' &&
  (v as Intent).entities !== null;

/** Wraps any provider with input truncation, a timeout and a safe fallback. */
export class GuardedLlmProvider implements LlmProvider {
  constructor(
    private readonly inner: LlmProvider,
    private readonly o: GuardedLlmOptions,
  ) {}

  async classify(text: string): Promise<Intent> {
    try {
      const result = await withTimeout(
        () => this.inner.classify(text.slice(0, this.o.maxInputChars)),
        this.o.timeoutMs,
      );
      if (isIntent(result)) return result;
      this.o.logger.warn({ reason: 'malformed' }, 'llm returned an invalid intent');
    } catch (error) {
      // Never log the input or the provider message: only the kind of failure.
      this.o.logger.warn(
        { reason: error instanceof Error ? error.name : 'UnknownError' },
        'llm failed; falling back to unknown',
      );
    }
    return FALLBACK;
  }
}
