import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const valid = {
  COTACAO_URL: 'http://localhost:3101',
  APOLICE_URL: 'http://localhost:3102',
  SINISTRO_URL: 'http://localhost:3103',
};

describe('loadConfig', () => {
  it('applies defaults to a minimal environment', () => {
    const r = loadConfig(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.PORT).toBe(8080);
    expect(r.value.HOST).toBe('0.0.0.0');
    expect(r.value.SERVICE_TIMEOUT_MS).toBe(4000);
    expect(r.value.SERVICE_RETRIES).toBe(2);
    expect(r.value.LLM_TIMEOUT_MS).toBe(1500);
    expect(r.value.LLM_MAX_INPUT_CHARS).toBe(1000);
    expect(r.value.TURN_LOG_CAPACITY).toBe(500);
    expect(r.value.SESSION_CAPACITY).toBe(2000);
    expect(r.value.SESSION_TTL_SECONDS).toBe(3600);
  });

  it('coerces numbers and treats empty values as missing', () => {
    const r = loadConfig({ ...valid, PORT: '3000', SERVICE_RETRIES: '' });
    expect(r.ok && r.value.PORT).toBe(3000);
    expect(r.ok && r.value.SERVICE_RETRIES).toBe(2);
  });

  it.each(['COTACAO_URL', 'APOLICE_URL', 'SINISTRO_URL'])('reports a missing %s', (key) => {
    const env: Record<string, string | undefined> = { ...valid };
    delete env[key];
    const r = loadConfig(env);
    expect(!r.ok && r.error.some((e) => e.startsWith(key))).toBe(true);
  });

  it('rejects an invalid URL and an out of range port', () => {
    expect(loadConfig({ ...valid, COTACAO_URL: 'not a url' }).ok).toBe(false);
    expect(loadConfig({ ...valid, PORT: '70000' }).ok).toBe(false);
  });

  it('rejects a retry max delay below the base delay', () => {
    const r = loadConfig({ ...valid, SERVICE_RETRY_BASE_MS: '500', SERVICE_RETRY_MAX_MS: '100' });
    expect(!r.ok && r.error.some((e) => e.startsWith('SERVICE_RETRY_MAX_MS'))).toBe(true);
  });

  it('rejects values below the minimum', () => {
    expect(loadConfig({ ...valid, SERVICE_TIMEOUT_MS: '0' }).ok).toBe(false);
    expect(loadConfig({ ...valid, SESSION_TTL_SECONDS: '5' }).ok).toBe(false);
  });
});
