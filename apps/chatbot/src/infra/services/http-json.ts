import { err, ok, type Result } from '@seguradora/protocol';
import type { z } from 'zod';
import type { CallContext, Logger } from '../../application/ports';
import type { ServiceFailure } from '../../domain/models';
import { ServiceHttpError } from './services-policy';

export interface HttpJsonClientOptions {
  baseUrl: string;
  /** Result of `createServicePolicy`: wraps the whole exchange, including reading the body. */
  policy: <T>(fn: (signal: AbortSignal) => Promise<T>) => Promise<T>;
  logger: Logger;
  fetchImpl?: typeof fetch;
}

export interface JsonCall<T> {
  method: 'GET' | 'POST';
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  schema: z.ZodType<T>;
  ctx: CallContext;
}

const HEADER_SAFE = /^[\x21-\x7e]{1,128}$/;

/** Talks JSON to one internal service and turns every outcome into `Result<T, ServiceFailure>`. */
export class HttpJsonClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly o: HttpJsonClientOptions) {
    this.fetchImpl = o.fetchImpl ?? fetch;
  }

  async call<T>(c: JsonCall<T>): Promise<Result<T, ServiceFailure>> {
    const url = new URL(c.path, this.o.baseUrl);
    for (const [k, v] of Object.entries(c.query ?? {})) url.searchParams.set(k, v);

    const headers: Record<string, string> = { accept: 'application/json' };
    if (HEADER_SAFE.test(c.ctx.correlationId)) headers['x-correlation-id'] = c.ctx.correlationId;
    if (c.method === 'POST') {
      headers['content-type'] = 'application/json';
      if (HEADER_SAFE.test(c.ctx.idempotencyKey)) headers['idempotency-key'] = c.ctx.idempotencyKey;
    }

    let outcome: { status: number; text: string };
    try {
      outcome = await this.o.policy(async (signal) => {
        const res = await this.fetchImpl(url, {
          method: c.method,
          headers,
          ...(c.body !== undefined ? { body: JSON.stringify(c.body) } : {}),
          signal,
        });
        if (res.status >= 500 || res.status === 429) {
          // Best effort: free the connection; the status is what matters.
          void res.body?.cancel().catch(() => undefined);
          throw new ServiceHttpError(res.status);
        }
        return { status: res.status, text: await res.text() };
      });
    } catch (error) {
      // Never log the URL (it can carry a cpf) nor the message: only the kind of failure.
      this.o.logger.warn(
        {
          op: `${c.method} ${c.path.replace(/\/[^/]*$/, '/…')}`,
          reason: error instanceof Error ? error.name : 'UnknownError',
        },
        'service call failed',
      );
      return err('unavailable');
    }

    if (outcome.status === 404) return err('not_found');
    if (outcome.status === 409) return err('conflict');
    if (outcome.status === 400 || outcome.status === 422) return err('invalid');
    if (outcome.status < 200 || outcome.status >= 300) return err('unavailable');

    let json: unknown;
    try {
      json = JSON.parse(outcome.text);
    } catch {
      this.o.logger.warn({ status: outcome.status }, 'service returned invalid JSON');
      return err('unavailable');
    }
    const parsed = c.schema.safeParse(json);
    if (!parsed.success) {
      this.o.logger.warn(
        {
          status: outcome.status,
          paths: parsed.error.issues.slice(0, 5).map((i) => i.path.join('.')),
        },
        'service response does not match the contract',
      );
      return err('unavailable');
    }
    return ok(parsed.data);
  }
}
