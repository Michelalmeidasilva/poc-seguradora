import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomId } from './random-id';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.unstubAllGlobals());

describe('randomId', () => {
  it('uses crypto.randomUUID when it exists', () => {
    vi.stubGlobal('crypto', {
      randomUUID: () => 'native-id',
      getRandomValues: crypto.getRandomValues.bind(crypto),
    });
    expect(randomId()).toBe('native-id');
  });

  it('builds a v4 UUID from getRandomValues when randomUUID is missing', () => {
    vi.stubGlobal('crypto', {
      randomUUID: undefined,
      getRandomValues: crypto.getRandomValues.bind(crypto),
    });
    expect(randomId()).toMatch(V4);
  });

  it('produces unique ids on the fallback path', () => {
    vi.stubGlobal('crypto', {
      randomUUID: undefined,
      getRandomValues: crypto.getRandomValues.bind(crypto),
    });
    const ids = new Set(Array.from({ length: 1000 }, () => randomId()));
    expect(ids.size).toBe(1000);
  });
});
