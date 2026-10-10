import { err, ok, type Result } from '@seguradora/protocol';
import { z } from 'zod';

const flag = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((v) => v === 'true');

const int = (fallback: number, min = 0) => z.coerce.number().int().min(min).default(fallback);

export const ConfigSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(8080),
    HOST: z.string().min(1).default('0.0.0.0'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    CHATBOT_URL: z.string().url(),
    SESSION_SECRET: z.string().min(32),
    ALLOWED_ORIGIN: z.string().url(),
    COOKIE_SECURE: flag('true'),
    COOKIE_SAME_SITE: z.enum(['none', 'lax', 'strict']).default('none'),
    // Number of trusted proxies in front of the gateway (0 = trust none; Cloud Run = 1).
    TRUST_PROXY_HOPS: int(0, 0),
    SESSION_TTL_SECONDS: int(43200, 60),
    UNUSED_SESSION_TTL_SECONDS: int(1800, 1),
    MAX_SESSIONS: int(1000, 1),
    BUFFER_CAPACITY: int(200, 1),
    SEEN_CAPACITY: int(500, 1),
    HEARTBEAT_MS: int(15000, 10),
    SSE_RETRY_MS: int(3000, 0),
    CHATBOT_CONNECT_TIMEOUT_MS: int(5000, 1),
    CHATBOT_TURN_TIMEOUT_MS: int(60000, 1),
    CHATBOT_RETRIES: int(2, 0),
    CHATBOT_RETRY_BASE_MS: int(200, 0),
    CHATBOT_RETRY_MAX_MS: int(2000, 0),
    BREAKER_FAILURE_THRESHOLD: int(5, 1),
    BREAKER_RESET_MS: int(10000, 0),
    BULKHEAD_MAX_CONCURRENT: int(20, 1),
    BULKHEAD_MAX_QUEUE: int(50, 0),
    MAX_QUEUED_TURNS: int(5, 1),
    SESSION_RATE_CAPACITY: int(40, 1),
    SESSION_RATE_PER_SECOND: z.coerce.number().positive().default(10),
    IP_RATE_CAPACITY: int(120, 1),
    IP_RATE_PER_SECOND: z.coerce.number().positive().default(30),
    SESSION_CREATE_CAPACITY: int(5, 1),
    SESSION_CREATE_PER_MINUTE: z.coerce.number().positive().default(5),
  })
  .superRefine((c, ctx) => {
    if (c.COOKIE_SAME_SITE === 'none' && !c.COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'COOKIE_SECURE must be true when COOKIE_SAME_SITE is none',
      });
    }
  });

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: Record<string, string | undefined>): Result<Config, string[]> {
  const r = ConfigSchema.safeParse(env);
  if (r.success) return ok(r.data);
  return err(r.error.issues.map((i) => `${i.path.join('.') || 'config'}: ${i.message}`));
}
