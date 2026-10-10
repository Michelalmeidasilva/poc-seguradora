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
    expect(r.value.TRUST_PROXY_HOPS).toBe(0);
    expect(r.value.SESSION_CREATE_CAPACITY).toBe(5);
    expect(r.value.SESSION_CREATE_PER_MINUTE).toBe(5);
    expect(r.value.UNUSED_SESSION_TTL_SECONDS).toBe(1800);
    expect(r.value.MAX_QUEUED_TURNS).toBe(5);
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
      TRUST_PROXY_HOPS: '1',
    });
    expect(r.ok && r.value.PORT).toBe(3000);
    expect(r.ok && r.value.COOKIE_SECURE).toBe(false);
    expect(r.ok && r.value.TRUST_PROXY_HOPS).toBe(1);
  });

  it('reports a missing CHATBOT_URL', () => {
    const env = { ...valid } as Record<string, string | undefined>;
    delete env.CHATBOT_URL;
    const r = loadConfig(env);
    expect(!r.ok && r.error.some((e) => e.startsWith('CHATBOT_URL'))).toBe(true);
  });

  it('rejects a short SESSION_SECRET without echoing it', () => {
    const secret = 'distinctive-secret-31-chars-xyz'; // 31 chars: one short of the minimum
    expect(secret).toHaveLength(31);
    const r = loadConfig({ ...valid, SESSION_SECRET: secret });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.some((e) => e.startsWith('SESSION_SECRET'))).toBe(true);
    expect(!r.ok && r.error.join(' ')).not.toContain(secret);
  });

  it('treats empty strings like missing keys', () => {
    const r = loadConfig({
      ...valid,
      SSE_RETRY_MS: '',
      PORT: '',
      IP_RATE_PER_SECOND: '',
      COOKIE_SAME_SITE: '',
      COOKIE_SECURE: '',
      LOG_LEVEL: '',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.SSE_RETRY_MS).toBe(3000);
    expect(r.value.PORT).toBe(8080);
    expect(r.value.IP_RATE_PER_SECOND).toBe(30);
    expect(r.value.COOKIE_SAME_SITE).toBe('none');
    expect(r.value.COOKIE_SECURE).toBe(true);
    expect(r.value.LOG_LEVEL).toBe('info');
  });

  it.each([
    ['CHATBOT_URL', 'not a url'],
    ['ALLOWED_ORIGIN', 'not-an-origin'],
    ['HEARTBEAT_MS', '9'],
    ['COOKIE_SAME_SITE', 'sideways'],
    ['LOG_LEVEL', 'verbose'],
  ])('rejects an invalid %s', (key, value) => {
    const r = loadConfig({ ...valid, COOKIE_SECURE: 'true', [key]: value });
    expect(!r.ok && r.error.some((e) => e.startsWith(key))).toBe(true);
  });

  it('rejects CHATBOT_RETRY_MAX_MS below CHATBOT_RETRY_BASE_MS', () => {
    const r = loadConfig({
      ...valid,
      CHATBOT_RETRY_BASE_MS: '500',
      CHATBOT_RETRY_MAX_MS: '100',
    });
    expect(!r.ok && r.error.some((e) => e.startsWith('CHATBOT_RETRY_MAX_MS'))).toBe(true);
    expect(
      loadConfig({ ...valid, CHATBOT_RETRY_BASE_MS: '100', CHATBOT_RETRY_MAX_MS: '100' }).ok,
    ).toBe(true);
  });

  it('rejects SameSite=None without Secure cookies', () => {
    const r = loadConfig({ ...valid, COOKIE_SAME_SITE: 'none', COOKIE_SECURE: 'false' });
    expect(!r.ok && r.error.some((e) => e.startsWith('COOKIE_SECURE'))).toBe(true);
  });

  it('rejects an invalid boolean, a negative hop count and an out of range port', () => {
    expect(loadConfig({ ...valid, COOKIE_SECURE: 'yes' }).ok).toBe(false);
    expect(loadConfig({ ...valid, TRUST_PROXY_HOPS: '-1' }).ok).toBe(false);
    expect(loadConfig({ ...valid, SESSION_CREATE_CAPACITY: '0' }).ok).toBe(false);
    expect(loadConfig({ ...valid, MAX_QUEUED_TURNS: '0' }).ok).toBe(false);
    expect(loadConfig({ ...valid, PORT: '70000' }).ok).toBe(false);
  });
});
