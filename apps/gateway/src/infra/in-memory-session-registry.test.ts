import { describe, expect, it } from 'vitest';
import { uuid } from '../test/fixtures';
import { InMemorySessionRegistry } from './in-memory-session-registry';

const make = (o: { maxSessions?: number; ttlMs?: number; unusedTtlMs?: number } = {}) => {
  const clock = { t: 0 };
  let n = 0;
  const registry = new InMemorySessionRegistry({
    maxSessions: o.maxSessions ?? 2,
    ttlMs: o.ttlMs ?? 1000,
    unusedTtlMs: o.unusedTtlMs ?? o.ttlMs ?? 1000,
    bufferCapacity: 10,
    seenCapacity: 10,
    newId: () => uuid(++n),
    now: () => clock.t,
  });
  return { registry, clock };
};

describe('InMemorySessionRegistry', () => {
  it('creates sessions with distinct ids and finds them again', () => {
    const { registry } = make();
    const a = registry.create();
    const b = registry.create();
    expect(a?.sessionId).not.toBe(b?.sessionId);
    expect(a && registry.get(a.sessionId)).toBe(a);
    expect(registry.size).toBe(2);
  });

  it('returns undefined when at capacity', () => {
    const { registry } = make({ maxSessions: 1 });
    expect(registry.create()).toBeDefined();
    expect(registry.create()).toBeUndefined();
  });

  it('returns undefined for an unknown id', () => {
    expect(make().registry.get('nope')).toBeUndefined();
  });

  it('expires idle sessions', () => {
    const { registry, clock } = make({ ttlMs: 1000 });
    const a = registry.create();
    clock.t = 1001;
    expect(a && registry.get(a.sessionId)).toBeUndefined();
  });

  it('keeps a session alive while it is used or touched', () => {
    const { registry, clock } = make({ ttlMs: 1000 });
    const a = registry.create();
    clock.t = 800;
    expect(a && registry.get(a.sessionId)).toBeDefined();
    clock.t = 1500;
    if (a) registry.touch(a.sessionId);
    clock.t = 2400;
    expect(a && registry.get(a.sessionId)).toBeDefined();
  });

  it('sweeps expired sessions and frees capacity', () => {
    const { registry, clock } = make({ maxSessions: 1, ttlMs: 1000 });
    registry.create();
    clock.t = 2000;
    expect(registry.sweep()).toBe(1);
    expect(registry.size).toBe(0);
    expect(registry.create()).toBeDefined();
  });

  it('removes a session on demand', () => {
    const { registry } = make();
    const a = registry.create();
    expect(a && registry.remove(a.sessionId)).toBe(true);
    expect(a && registry.get(a.sessionId)).toBeUndefined();
    expect(registry.remove('nope')).toBe(false);
  });

  it('sweeps expired sessions before refusing a new one', () => {
    const { registry, clock } = make({ maxSessions: 1, ttlMs: 1000 });
    registry.create();
    clock.t = 2000;
    expect(registry.create()).toBeDefined();
  });

  describe('unused sessions', () => {
    it('expires a never-used session after unusedTtlMs', () => {
      const { registry, clock } = make({ ttlMs: 10_000, unusedTtlMs: 1000 });
      const a = registry.create();
      clock.t = 1001;
      expect(a && registry.get(a.sessionId)).toBeUndefined();
    });

    it('lives until ttlMs once marked active', () => {
      const { registry, clock } = make({ ttlMs: 10_000, unusedTtlMs: 1000 });
      const a = registry.create();
      if (a) registry.markActive(a.sessionId);
      clock.t = 5000;
      expect(a && registry.get(a.sessionId)).toBe(a);
      clock.t = 5000 + 10_001;
      expect(a && registry.get(a.sessionId)).toBeUndefined();
    });

    it('sweeps unused sessions earlier than active ones', () => {
      const { registry, clock } = make({ maxSessions: 2, ttlMs: 10_000, unusedTtlMs: 1000 });
      const used = registry.create();
      registry.create();
      if (used) registry.markActive(used.sessionId);
      clock.t = 2000;
      expect(registry.sweep()).toBe(1);
      expect(registry.size).toBe(1);
      expect(used && registry.get(used.sessionId)).toBe(used);
    });

    it('ignores markActive for an unknown session', () => {
      expect(() => make().registry.markActive('nope')).not.toThrow();
    });
  });
});
