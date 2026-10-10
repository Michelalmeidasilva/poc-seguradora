import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { JoseTokenService } from './jose-token-service';

const secret = 'a'.repeat(32);
const make = (now: () => number = Date.now, s = secret) =>
  new JoseTokenService({ secret: s, ttlSeconds: 60, now });

describe('JoseTokenService', () => {
  it('verifies a token it issued and returns the session id', async () => {
    const service = make();
    const token = await service.issue('session-1');
    const r = await service.verify(token);
    expect(r).toEqual({ ok: true, value: { sessionId: 'session-1' } });
  });

  it('rejects a tampered token', async () => {
    const service = make();
    const token = await service.issue('session-1');
    const tampered = `${token.slice(0, -2)}xx`;
    const r = await service.verify(tampered);
    expect(!r.ok && r.error).toBe('invalid');
  });

  it('rejects a token signed with another secret', async () => {
    const token = await make(Date.now, 'b'.repeat(32)).issue('session-1');
    const r = await make().verify(token);
    expect(!r.ok && r.error).toBe('invalid');
  });

  it('reports an expired token as expired', async () => {
    const clock = { t: Date.parse('2026-10-10T12:00:00.000Z') };
    const service = make(() => clock.t);
    const token = await service.issue('session-1');
    clock.t += 61_000;
    const r = await service.verify(token);
    expect(!r.ok && r.error).toBe('expired');
  });

  it('rejects garbage and unsigned tokens', async () => {
    const service = make();
    expect((await service.verify('not-a-token')).ok).toBe(false);
    const unsigned = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from('{"sub":"x"}').toString('base64url')}.`;
    expect((await service.verify(unsigned)).ok).toBe(false);
  });

  it('rejects a validly signed token without a subject', async () => {
    const key = new TextEncoder().encode(secret);
    const token = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).sign(key);
    const r = await make().verify(token);
    expect(!r.ok && r.error).toBe('invalid');
  });

  it('refuses a short secret', () => {
    expect(() => make(Date.now, 'short')).toThrow(RangeError);
  });
});
