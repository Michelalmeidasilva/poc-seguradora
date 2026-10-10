import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const valid = {
  CHATBOT_URL: 'http://localhost:8081',
  SESSION_SECRET: 'x'.repeat(32),
  ALLOWED_ORIGIN: 'http://localhost:5173',
};

describe('loadConfig', () => {
  it('applies defaults to a minimal environment', () => {
    const r = loadConfig(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.PORT).toBe(8080);
    expect(r.value.HOST).toBe('0.0.0.0');
    expect(r.value.COOKIE_SECURE).toBe(true);
    expect(r.value.COOKIE_SAME_SITE).toBe('none');
    expect(r.value.TRUST_PROXY).toBe(true);
    expect(r.value.BUFFER_CAPACITY).toBe(200);
    expect(r.value.HEARTBEAT_MS).toBe(15000);
    expect(r.value.CHATBOT_TURN_TIMEOUT_MS).toBe(60000);
  });

  it('coerces numbers and booleans', () => {
    const r = loadConfig({
      ...valid,
      PORT: '3000',
      COOKIE_SECURE: 'false',
      COOKIE_SAME_SITE: 'lax',
      TRUST_PROXY: 'false',
    });
    expect(r.ok && r.value.PORT).toBe(3000);
    expect(r.ok && r.value.COOKIE_SECURE).toBe(false);
    expect(r.ok && r.value.TRUST_PROXY).toBe(false);
  });

  it('reports a missing CHATBOT_URL', () => {
    const env = { ...valid } as Record<string, string | undefined>;
    delete env.CHATBOT_URL;
    const r = loadConfig(env);
    expect(!r.ok && r.error.some((e) => e.startsWith('CHATBOT_URL'))).toBe(true);
  });

  it('rejects a short SESSION_SECRET without echoing it', () => {
    const r = loadConfig({ ...valid, SESSION_SECRET: 'short' });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.join(' ')).not.toContain('short');
  });

  it('rejects SameSite=None without Secure cookies', () => {
    const r = loadConfig({ ...valid, COOKIE_SAME_SITE: 'none', COOKIE_SECURE: 'false' });
    expect(!r.ok && r.error.some((e) => e.startsWith('COOKIE_SECURE'))).toBe(true);
  });

  it('rejects an invalid boolean and an out of range port', () => {
    expect(loadConfig({ ...valid, TRUST_PROXY: 'yes' }).ok).toBe(false);
    expect(loadConfig({ ...valid, PORT: '70000' }).ok).toBe(false);
  });
});
