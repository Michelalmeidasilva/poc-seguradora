import { expect, it } from 'vitest';
import { auditAssistancePaths } from './drive';
import { startChatbot } from './harness';

it('explores the filled dependent review even after observing an incomplete review', async () => {
  const bot = await startChatbot({ env: { SESSION_CAPACITY: '1000' } });
  try {
    const audit = await auditAssistancePaths(bot.url, bot.screenId);
    expect(audit.rows.find((row) => row.id === 'DEP-08')?.path ?? []).toContain('submit:DEP-05');
    expect(audit.missing).not.toContain('DEP-08');
    expect(audit.failures).not.toContain('DEP-08:entry/transition did not render expected state');
    expect(audit.rows.find((row) => row.id === 'IDE-02')?.path ?? []).toContain('submit:IDE-08');
    expect(audit.missing).not.toContain('DEP-32');
    expect(audit.missing).not.toContain('IDE-04');
    expect(audit.missing).not.toContain('ENT-03');
    expect(audit.missing).not.toContain('ENT-05');
    expect(audit.missing).not.toContain('ENT-08');
    expect(audit.missing).not.toContain('PLA-07');
    expect(audit.missing).not.toContain('CAN-06');
    expect(audit.rows.find((row) => row.id === 'IDE-04')?.path ?? []).toContain('submit:IDE-08');
    expect(audit.rows.find((row) => row.id === 'FUN-07')?.path ?? []).toContain('submit:FUN-04');
  } finally {
    await bot.close();
  }
}, 30_000);
