import { err, ok, type Result } from '@seguradora/protocol';
import { errors, jwtVerify, SignJWT } from 'jose';
import type { Clock, TokenService } from '../application/ports';

export interface JoseTokenServiceOptions {
  secret: string;
  ttlSeconds: number;
  now?: Clock;
}

/** HS256 JWT whose subject is the session id. */
export class JoseTokenService implements TokenService {
  private readonly key: Uint8Array;
  private readonly now: Clock;

  constructor(private readonly o: JoseTokenServiceOptions) {
    if (o.secret.length < 32) {
      throw new RangeError('JoseTokenService: secret must have at least 32 characters');
    }
    this.key = new TextEncoder().encode(o.secret);
    this.now = o.now ?? Date.now;
  }

  async issue(sessionId: string): Promise<string> {
    const issuedAt = Math.floor(this.now() / 1000);
    return new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(sessionId)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + this.o.ttlSeconds)
      .sign(this.key);
  }

  async verify(token: string): Promise<Result<{ sessionId: string }, 'invalid' | 'expired'>> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ['HS256'],
        currentDate: new Date(this.now()),
      });
      return payload.sub ? ok({ sessionId: payload.sub }) : err('invalid');
    } catch (error) {
      return err(error instanceof errors.JWTExpired ? 'expired' : 'invalid');
    }
  }
}
