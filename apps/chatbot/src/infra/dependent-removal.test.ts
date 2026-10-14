import { expect, it } from 'vitest';
import { MockAssistance } from './mock-assistance';

it('keeps the participant until the illustrative date and refuses undo after it takes effect', async () => {
  let now = Date.parse('2026-11-09T12:00:00-03:00');
  const mock = new MockAssistance({ capacity: 4, ttlMs: 7 * 24 * 60 * 60 * 1000, now: () => now });
  const context = (id: string) => ({ correlationId: id, idempotencyKey: id });
  await mock.addDependent(
    'date-fixture',
    {
      confirmed: true,
      dependent: {
        name: 'Ana Lima',
        cpf: '98765432100',
        birthDate: '2012-05-20',
        relationship: 'filha',
        phone: '11999999999',
        biologicalSex: 'not_informed',
      },
    },
    context('add'),
  );
  await mock.removeDependent(
    'date-fixture',
    { confirmed: true, dependentId: 'DEP-DEMO-1' },
    context('schedule'),
  );
  const before = await mock.listDependents('date-fixture', context('before'));
  expect(before.ok && before.value).toHaveLength(1);
  now = Date.parse('2026-11-10T00:00:00-03:00');
  const after = await mock.listDependents('date-fixture', context('after'));
  expect(after.ok && after.value).toHaveLength(0);
  expect(
    await mock.cancelDependentRemoval(
      'date-fixture',
      { confirmed: true, dependentId: 'DEP-DEMO-1' },
      context('too-late'),
    ),
  ).toEqual({ ok: false, error: 'conflict' });
  const snapshot = await mock.getSessionSnapshot('date-fixture', context('status'));
  expect(snapshot.ok && snapshot.value.dependentRemovals).toEqual([
    { dependentId: 'DEP-DEMO-1', effectiveDate: '2026-11-10', status: 'completed' },
  ]);
  const isolated = await mock.getSessionSnapshot('other-session', context('isolated'));
  expect(isolated.ok && isolated.value.dependentRemovals).toEqual([]);
});
