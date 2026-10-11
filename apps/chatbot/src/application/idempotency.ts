import { createHash } from 'node:crypto';

/**
 * `Idempotency-Key` for the internal services: event ids come from the client, so the key is
 * scoped by session and hashed (64 hex characters, always header safe).
 */
export const idempotencyKeyFor = (sessionId: string, eventId: string): string =>
  createHash('sha256').update(`${sessionId}\n${eventId}`).digest('hex');
