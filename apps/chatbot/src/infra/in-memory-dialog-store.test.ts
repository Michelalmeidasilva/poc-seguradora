import { describe, expect, it } from 'vitest';
import { IDLE } from '../domain/dialog';
import { InMemoryDialogStore } from './in-memory-dialog-store';

const make = (o: { capacity?: number; ttlMs?: number } = {}) => {
  const clock = { t: 0 };
  const store = new InMemoryDialogStore({
    capacity: o.capacity ?? 2,
    ttlMs: o.ttlMs ?? 1000,
    now: () => clock.t,
  });
  return { store, clock };
};

describe('InMemoryDialogStore', () => {
  it('returns idle for an unknown session', () => {
    expect(make().store.get('nope')).toEqual(IDLE);
  });

  it('stores and returns the state of a session', () => {
    const { store } = make();
    store.set('s1', { name: 'claim.awaiting_cpf' });
    expect(store.get('s1')).toEqual({ name: 'claim.awaiting_cpf' });
  });

  it('forgets a session after the ttl and refreshes the ttl on writes', () => {
    const { store, clock } = make({ ttlMs: 1000 });
    store.set('s1', { name: 'claim.awaiting_cpf' });
    clock.t = 800;
    store.set('s1', { name: 'policies.awaiting_cpf' });
    clock.t = 1500;
    expect(store.get('s1')).toEqual({ name: 'policies.awaiting_cpf' });
    clock.t = 2600;
    expect(store.get('s1')).toEqual(IDLE);
  });

  it('evicts the least recently written session beyond capacity', () => {
    const { store } = make({ capacity: 2 });
    store.set('a', { name: 'claim.awaiting_cpf' });
    store.set('b', { name: 'claim.awaiting_cpf' });
    store.set('a', { name: 'policies.awaiting_cpf' });
    store.set('c', { name: 'claim.awaiting_cpf' });
    expect(store.get('b')).toEqual(IDLE);
    expect(store.get('a')).toEqual({ name: 'policies.awaiting_cpf' });
  });

  it('sweeps expired sessions', () => {
    const { store, clock } = make({ ttlMs: 1000 });
    store.set('a', { name: 'claim.awaiting_cpf' });
    clock.t = 2000;
    expect(store.sweep()).toBe(1);
  });

  it.each([0, -1, 1.5])('rejects capacity %s', (capacity) => {
    expect(() => new InMemoryDialogStore({ capacity, ttlMs: 1000, now: () => 0 })).toThrow(
      RangeError,
    );
  });
});
