import { err, ok, type Result } from '@seguradora/protocol';
import { z } from 'zod';

/** An empty env string (`KEY=`) behaves like a missing key. */
const blankAsMissing = (v: unknown) => (v === '' ? undefined : v);
const optional = <T extends z.ZodTypeAny>(schema: T) => z.preprocess(blankAsMissing, schema);

const int = (fallback: number, min = 0) =>
  optional(z.coerce.number().int().min(min).default(fallback));

export const ConfigSchema = z
  .object({
    PORT: optional(z.coerce.number().int().min(1).max(65535).default(8080)),
    HOST: optional(z.string().min(1).default('0.0.0.0')),
    LOG_LEVEL: optional(
      z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    ),
    COTACAO_URL: z.string().url(),
    APOLICE_URL: z.string().url(),
    SINISTRO_URL: z.string().url(),
    SERVICE_TIMEOUT_MS: int(4000, 1),
    SERVICE_RETRIES: int(2, 0),
    SERVICE_RETRY_BASE_MS: int(100, 0),
    SERVICE_RETRY_MAX_MS: int(1000, 0),
    BREAKER_FAILURE_THRESHOLD: int(5, 1),
    BREAKER_RESET_MS: int(10000, 0),
    BULKHEAD_MAX_CONCURRENT: int(10, 1),
    BULKHEAD_MAX_QUEUE: int(20, 0),
    LLM_TIMEOUT_MS: int(1500, 1),
    LLM_MAX_INPUT_CHARS: int(1000, 1),
    TURN_LOG_CAPACITY: int(500, 1),
    SESSION_CAPACITY: int(2000, 1),
    SESSION_TTL_SECONDS: int(3600, 60),
    // Keep below the platform's SIGTERM-to-SIGKILL window (10 s on Cloud Run).
    SHUTDOWN_GRACE_MS: int(8000, 0),
  })
  .superRefine((c, ctx) => {
    if (c.SERVICE_RETRY_MAX_MS < c.SERVICE_RETRY_BASE_MS) {
      ctx.addIssue({
        code: 'custom',
        path: ['SERVICE_RETRY_MAX_MS'],
        message: 'SERVICE_RETRY_MAX_MS must be >= SERVICE_RETRY_BASE_MS',
      });
    }
  });

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: Record<string, string | undefined>): Result<Config, string[]> {
  const r = ConfigSchema.safeParse(env);
  if (r.success) return ok(r.data);
  return err(r.error.issues.map((i) => `${i.path.join('.') || 'config'}: ${i.message}`));
}
