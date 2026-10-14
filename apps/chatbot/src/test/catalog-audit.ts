import { expect, it } from 'vitest';
import { auditAssistancePaths } from './drive';
import { startChatbot } from './harness';
import { MockAssistance } from '../infra/mock-assistance';

it('reaches all 247 IDs through user API paths and checks every emitted quick label', async () => {
  const audits: Array<Awaited<ReturnType<typeof auditAssistancePaths>>> = [];
  for (const fixture of ['canonical', 'without_dependents']) {
    const bot = await startChatbot({
      env: { SESSION_CAPACITY: '1000' },
      ...(fixture === 'without_dependents'
        ? { overrides: { assistance: new MockAssistance({ capacity: 1000, ttlMs: 60_000 }) } }
        : {}),
    });
    try {
      audits.push(await auditAssistancePaths(bot.url, bot.screenId));
    } finally {
      await bot.close();
    }
  }
  const first = audits[0]!;
  const audit = {
    rows: first.rows.map(
      (row) =>
        audits
          .map((item) => item.rows.find((candidate) => candidate.id === row.id)!)
          .find((candidate) => candidate.path) ?? row,
    ),
    missing: first.missing.filter((id) => audits.every((item) => item.missing.includes(id))),
    failures: [...new Set(audits.flatMap((item) => item.failures))],
    overlongEmittedLabels: [...new Set(audits.flatMap((item) => item.overlongEmittedLabels))],
    fixtures: ['canonical', 'without_dependents'],
  };
  console.log(JSON.stringify(audit, null, 2));
  expect
    .soft(audit.missing, 'unreached IDs: bind actual entry/condition paths, never whitelist')
    .toEqual([]);
  expect.soft(audit.failures).toEqual([]);
  expect.soft(audit.overlongEmittedLabels, 'emitted titles above 20 characters').toEqual([]);
});
