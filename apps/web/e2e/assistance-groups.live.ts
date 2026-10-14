import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, test, type Page } from '@playwright/test';
import { expectTextIdentityGate, identifyByChat } from './identity-text.helpers';

type Step = { id: string; user: string; bot: string; mode: string; requiresAuth: boolean };
const sandbox: { window: { EXPERIENCE?: { index: Record<string, Step> } } } = { window: {} };
runInNewContext(
  readFileSync(
    new URL('../../../docs/prototypes/whatsapp-experience/catalog.js', import.meta.url),
    'utf8',
  ),
  sandbox,
);
const source = sandbox.window.EXPERIENCE!.index;
// Representative actual user paths, not opening IDs or visiting the atlas explorer.
// NOT-10 is the existing stale-notice journey; proactive NOT-01..09 remain a separate gap.
const ids = [
  'ENT-02',
  'FAQ-01',
  'NAV-01',
  'IDE-08',
  'AUD-01',
  'DES-01',
  'ADE-01',
  'PAG-01',
  'CON-01',
  'DEP-01',
  'EXC-01',
  'PLA-01',
  'CAD-01',
  'UTI-01',
  'FUN-01',
  'COB-01',
  'CAN-04',
  'FIM-01',
  'REN-01',
  'SOL-01',
  'HUM-01',
  'RET-03',
  'NOT-10',
  'PRE-01',
];

async function send(page: Page, text: string) {
  const input = page.getByRole('textbox', { name: 'Mensagem' });
  await input.fill(text);
  await input.press('Enter');
}
async function cpf(page: Page) {
  await identifyByChat(page);
}
for (const id of ids) {
  test(`canonical journey ${id.slice(0, 3)} captures representative ${id} in the real application`, async ({
    page,
  }) => {
    const step = source[id]!;
    await page.goto('/');
    await expect(
      page.getByRole('button', { name: 'Conhecer produtos', exact: true }),
    ).toBeVisible();
    if (id === 'IDE-08') {
      await page.getByRole('button', { name: 'Meu contrato', exact: true }).click();
      await expectTextIdentityGate(page);
      await cpf(page);
      await expect(page.getByRole('button', { name: 'Ver contrato', exact: true })).toBeVisible();
    } else if (id === 'AUD-01') {
      await page.getByRole('button', { name: 'Meu contrato', exact: true }).click();
      await cpf(page);
      await page.getByRole('button', { name: 'Mensagem de áudio', exact: true }).click();
      await page.getByRole('button', { name: /^AUD-01/ }).click();
      await expect(page.getByText(step.bot.replace(/\*\*/g, ''), { exact: false })).toBeVisible();
    } else if (id !== 'ENT-02') {
      await send(page, step.user);
      if (step.requiresAuth) await cpf(page);
      const visibleCopy = step.bot.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
      await expect(page.getByText(visibleCopy, { exact: false }).last()).toBeVisible();
      if (['list', 'form', 'review'].includes(step.mode)) {
        const label =
          step.mode === 'list'
            ? 'Selecionar uma opção'
            : step.mode === 'review'
              ? 'Abrir revisão'
              : 'Abrir formulário';
        await page.getByRole('button', { name: label, exact: true }).last().click();
        await expect(page.getByRole('dialog')).toBeVisible();
      }
    }
    for (const viewport of [
      { width: 320, height: 844 },
      { width: 390, height: 844 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: test.info().outputPath(`${id}-${viewport.width}.png`) });
    }
  });
}
