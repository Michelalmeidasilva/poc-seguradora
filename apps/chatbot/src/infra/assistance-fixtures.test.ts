import { expect, it } from 'vitest';
import type { AssistanceDependent } from '../application/assistance-service';
import { MockAssistance } from './mock-assistance';

const maria: AssistanceDependent = {
  id: 'DEP-DEMO-1',
  name: 'Maria Silva',
  cpf: '12345678909',
  birthDate: '2014-03-12',
  relationship: 'Filha',
  phone: '11999999999',
  biologicalSex: 'not_informed',
};
const ctx = (id: string) => ({ correlationId: id, idempotencyKey: id });
const options = { capacity: 4, ttlMs: 100, now: () => 0 };

it('keeps the unconfigured mock empty', async () => {
  expect(await new MockAssistance(options).listDependents('empty', ctx('read'))).toEqual({
    ok: true,
    value: [],
  });
});

it('copies initial participants at startup and isolates reads, sessions and expiration', async () => {
  let now = 0;
  const supplied = [{ ...maria }];
  const mock = new MockAssistance({ ...options, now: () => now, initialDependents: supplied });
  supplied[0]!.name = 'Alterada fora';
  supplied.push({ ...maria, id: 'external' });
  const first = await mock.getSessionSnapshot('one', ctx('first'));
  expect(first.ok && first.value.dependents).toEqual([maria]);
  if (!first.ok) throw new Error('snapshot unavailable');
  first.value.dependents[0]!.phone = 'alterado fora';
  await mock.updateDependent(
    'one',
    {
      confirmed: true,
      dependentId: maria.id,
      changes: { name: 'Alterada na sessão' },
    },
    ctx('update'),
  );
  expect(await mock.listDependents('one', ctx('changed'))).toEqual({
    ok: true,
    value: [{ ...maria, name: 'Alterada na sessão' }],
  });
  expect(await mock.listDependents('two', ctx('independent'))).toEqual({
    ok: true,
    value: [maria],
  });
  now = 100;
  expect(await mock.listDependents('one', ctx('expired'))).toEqual({ ok: true, value: [maria] });
});

it('allocates distinct IDs after a DEP-DEMO-1 seed', async () => {
  const mock = new MockAssistance({ ...options, initialDependents: [maria] });
  const dependent = {
    name: maria.name,
    cpf: maria.cpf,
    birthDate: maria.birthDate,
    relationship: maria.relationship,
    phone: maria.phone,
    biologicalSex: maria.biologicalSex,
  };
  expect(await mock.addDependent('one', { confirmed: true, dependent }, ctx('add'))).toEqual({
    ok: true,
    value: { ...dependent, id: 'DEP-DEMO-2' },
  });
  expect(await mock.addDependent('one', { confirmed: true, dependent }, ctx('add-again'))).toEqual({
    ok: true,
    value: { ...dependent, id: 'DEP-DEMO-3' },
  });
  expect(await mock.listDependents('one', ctx('list'))).toEqual({
    ok: true,
    value: [maria, { ...dependent, id: 'DEP-DEMO-2' }, { ...dependent, id: 'DEP-DEMO-3' }],
  });
});

it('preserves scheduled removal metadata and undo for a seeded participant', async () => {
  let now = Date.parse('2026-11-09T12:00:00-03:00');
  const mock = new MockAssistance({
    ...options,
    ttlMs: 7 * 24 * 60 * 60 * 1000,
    now: () => now,
    initialDependents: [maria],
  });
  const command = { confirmed: true as const, dependentId: maria.id };
  expect(await mock.removeDependent('one', command, ctx('remove'))).toEqual({
    ok: true,
    value: undefined,
  });
  const scheduled = await mock.getSessionSnapshot('one', ctx('scheduled'));
  expect(scheduled.ok && scheduled.value.dependents).toEqual([maria]);
  expect(scheduled.ok && scheduled.value.dependentRemovals).toEqual([
    { dependentId: maria.id, effectiveDate: '2026-11-10', status: 'scheduled' },
  ]);
  expect(await mock.cancelDependentRemoval('one', command, ctx('undo'))).toEqual({
    ok: true,
    value: undefined,
  });
  now = Date.parse('2026-11-10T00:00:00-03:00');
  const cancelled = await mock.getSessionSnapshot('one', ctx('cancelled'));
  expect(cancelled.ok && cancelled.value.dependents).toEqual([maria]);
  expect(cancelled.ok && cancelled.value.dependentRemovals).toEqual([
    { dependentId: maria.id, effectiveDate: '2026-11-10', status: 'cancelled' },
  ]);
  expect(await mock.listDependents('two', ctx('other'))).toEqual({ ok: true, value: [maria] });
});

it.each([
  null,
  [{ ...maria, cpf: 'sensitive-invalid-cpf' }],
  [{ ...maria, biologicalSex: 'inferred' }],
  [{ ...maria, id: '' }],
  [maria, { ...maria }],
  [{ ...maria, extra: 'sensitive-extra' }],
  [{ ...maria, birthDate: '12/03/2014' }],
])('rejects invalid seeds at startup with a stable data-free error (%#)', (initialDependents) => {
  expect(
    () =>
      new MockAssistance({
        ...options,
        initialDependents: initialDependents as unknown as AssistanceDependent[],
      }),
  ).toThrowError(new Error('invalid initialDependents'));
});
