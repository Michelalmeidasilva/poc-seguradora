import { describe, expect, it } from 'vitest';
import type { CallContext } from '../application/ports';
import { MockAssistance } from './mock-assistance';

const context = (id: string): CallContext => ({ correlationId: `corr-${id}`, idempotencyKey: id });
const confirmed = { confirmed: true as const };

describe('MockAssistance', () => {
  it('starts independent deterministic fixtures for each session', async () => {
    const mock = new MockAssistance({ capacity: 4, ttlMs: 1000, now: () => 0 });
    const a = await mock.listDependents('session-a', context('read-a'));
    const b = await mock.listDependents('session-b', context('read-b'));
    expect(a.ok && a.value).toEqual([]);
    expect(b.ok && b.value).toEqual([]);
    const added = await mock.addDependent(
      'session-a',
      {
        ...confirmed,
        dependent: {
          name: 'Joana Exemplo',
          cpf: '12345678901',
          birthDate: '2010-02-03',
          relationship: 'filha',
        },
      },
      context('add-a'),
    );
    expect(added.ok).toBe(true);
    const onlyA = await mock.listDependents('session-a', context('read-a2'));
    const stillB = await mock.listDependents('session-b', context('read-b2'));
    expect(onlyA.ok && onlyA.value).toHaveLength(1);
    expect(stillB.ok && stillB.value).toEqual([]);
  });

  it('returns fictitious snapshot data without requiring an initial CPF', async () => {
    const mock = new MockAssistance({ capacity: 2, ttlMs: 1000, now: () => 0 });
    const result = await mock.getSessionSnapshot('new-session', context('snapshot'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.demonstrative).toBe(true);
      expect(JSON.stringify(result.value)).not.toContain('cpf');
      expect(JSON.stringify(result.value)).not.toMatch(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/);
    }
  });

  it('restarts a session from clean fixtures after ttl expiration', async () => {
    let now = 0;
    const mock = new MockAssistance({ capacity: 2, ttlMs: 100, now: () => now });
    await mock.addDependent(
      's1',
      {
        ...confirmed,
        dependent: {
          name: 'Joana',
          cpf: '12345678901',
          birthDate: '2010-02-03',
          relationship: 'filha',
        },
      },
      context('add'),
    );
    now = 101;
    const result = await mock.listDependents('s1', context('after-expiry'));
    expect(result.ok && result.value).toEqual([]);
  });

  it('restarts an evicted session from clean fixtures when capacity is exceeded', async () => {
    const mock = new MockAssistance({ capacity: 1, ttlMs: 1000, now: () => 0 });
    await mock.addDependent(
      's1',
      {
        ...confirmed,
        dependent: {
          name: 'Joana',
          cpf: '12345678901',
          birthDate: '2010-02-03',
          relationship: 'filha',
        },
      },
      context('add'),
    );
    await mock.getSessionSnapshot('s2', context('s2'));
    const result = await mock.listDependents('s1', context('s1-again'));
    expect(result.ok && result.value).toEqual([]);
  });

  it('replays a repeated idempotency key without duplicating a confirmed mutation', async () => {
    const mock = new MockAssistance({ capacity: 2, ttlMs: 1000, now: () => 0 });
    const input = {
      ...confirmed,
      dependent: {
        name: 'Joana',
        cpf: '12345678901',
        birthDate: '2010-02-03',
        relationship: 'filha',
      },
    };
    const first = await mock.addDependent('s1', input, context('same-key'));
    const replay = await mock.addDependent('s1', input, context('same-key'));
    const list = await mock.listDependents('s1', context('list'));
    expect(replay).toEqual(first);
    expect(list.ok && list.value).toHaveLength(1);
  });

  it('does not expose mutable references to stored session state', async () => {
    const mock = new MockAssistance({ capacity: 2, ttlMs: 1000, now: () => 0 });
    const dependent = await mock.addDependent(
      's1',
      {
        ...confirmed,
        dependent: {
          name: 'Joana',
          cpf: '12345678901',
          birthDate: '2010-02-03',
          relationship: 'filha',
        },
      },
      context('add'),
    );
    if (dependent.ok) dependent.value.name = 'Alterado pelo consumidor';
    const request = await mock.createRequest(
      's1',
      { ...confirmed, kind: 'human_handoff', message: 'Solicitação demonstrativa.' },
      context('request'),
    );
    if (request.ok) request.value.message = 'Alterado pelo consumidor';

    const snapshot = await mock.getSessionSnapshot('s1', context('snapshot'));
    expect(snapshot.ok && snapshot.value.dependents[0]?.name).toBe('Joana');
    expect(snapshot.ok && snapshot.value.requests[0]?.message).toBe('Solicitação demonstrativa.');
  });

  it('bounds retained idempotency keys per session', async () => {
    const mock = new MockAssistance({
      capacity: 2,
      ttlMs: 1000,
      idempotencyCapacity: 2,
      now: () => 0,
    });
    const command = {
      ...confirmed,
      kind: 'human_handoff' as const,
      message: 'Solicitação demonstrativa.',
    };
    await mock.createRequest('s1', command, context('first'));
    await mock.createRequest('s1', command, context('second'));
    await mock.createRequest('s1', command, context('third'));
    await mock.createRequest('s1', command, context('first'));
    const requests = await mock.listRequests('s1', context('read'));
    expect(requests.ok && requests.value).toHaveLength(4);
  });

  it('returns expected failures as Result values without reporting success', async () => {
    const mock = new MockAssistance({
      capacity: 2,
      ttlMs: 1000,
      now: () => 0,
      unavailable: ['cancelAssistance'],
    });
    const result = await mock.cancelAssistance(
      's1',
      { ...confirmed, reason: 'requested' },
      context('cancel'),
    );
    expect(result).toEqual({ ok: false, error: 'unavailable' });
    const snapshot = await mock.getSessionSnapshot('s1', context('read'));
    expect(snapshot.ok && snapshot.value.contract.status).toBe('active');
  });

  it('returns malformed call context as an expected Result failure', async () => {
    const mock = new MockAssistance({ capacity: 2, ttlMs: 1000, now: () => 0 });
    const result = await mock.getSessionSnapshot('s1', {
      correlationId: '',
      idempotencyKey: 'read',
    });
    expect(result).toEqual({ ok: false, error: 'invalid' });
  });

  it('reflects confirmed cancellation in later reads', async () => {
    const mock = new MockAssistance({ capacity: 2, ttlMs: 1000, now: () => 0 });
    const result = await mock.cancelAssistance(
      's1',
      { ...confirmed, reason: 'requested' },
      context('cancel'),
    );
    expect(result.ok).toBe(true);
    const snapshot = await mock.getSessionSnapshot('s1', context('read'));
    expect(snapshot.ok && snapshot.value.contract.status).toBe('cancelled');
  });
});
