import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { idempotencyKeyFor } from './idempotency';

describe('idempotencyKeyFor', () => {
  it('is the sha256 hex of session id, newline and event id', () => {
    const expected = createHash('sha256').update('s1\nevt-1').digest('hex');
    expect(idempotencyKeyFor('s1', 'evt-1')).toBe(expected);
  });

  it('is 64 lower-case hex characters (header safe)', () => {
    expect(idempotencyKeyFor('sessão com espaço\n', 'x\r\ny')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs between sessions for the same event id and is stable', () => {
    expect(idempotencyKeyFor('s1', 'e')).not.toBe(idempotencyKeyFor('s2', 'e'));
    expect(idempotencyKeyFor('s1', 'e')).toBe(idempotencyKeyFor('s1', 'e'));
  });
});
