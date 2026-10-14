import { expect, test, type Page } from '@playwright/test';
import { expectTextIdentityGate, identifyByChat } from './identity-text.helpers';

test.use({ baseURL: 'http://localhost:8080' });
// The real gateway's session refill may exceed the transport-mock timeout.
test.setTimeout(75_000);

async function say(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Mensagem' }).fill(text);
  await page.getByRole('textbox', { name: 'Mensagem' }).press('Enter');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // Session creation is rate-limited on the real stack (5/minute); allow its
  // Retry-After recovery instead of inheriting the 5 s transport-mock budget.
  await expect(page.getByRole('button', { name: 'Conhecer produtos' })).toBeVisible({
    timeout: 30_000,
  });
});

test('integrated public discovery offers only the three assistance services', async ({ page }) => {
  await page.getByRole('button', { name: 'Conhecer produtos' }).click();
  await page.getByRole('button', { name: 'Selecionar uma opção', exact: true }).click();
  await expect(page.getByText('Assistência Funeral', { exact: true })).toBeVisible();
  await expect(page.getByText('Assistência Farmácia', { exact: true })).toBeVisible();
  await expect(page.getByText('Telemedicina', { exact: true })).toBeVisible();
  await expect(page.getByLabel('CPF', { exact: true })).toHaveCount(0);
});

test('integrated CPF format gate rejects short input, accepts any eleven digits and keeps storage private', async ({
  page,
}) => {
  const canary = '98765432100';
  await say(page, 'Quero ver meu contrato.');
  await expectTextIdentityGate(page);
  await say(page, '12345');
  await expect(page.getByText(/11 dígitos/).last()).toBeVisible();
  await identifyByChat(page, canary);
  await expect(
    page.getByRole('button', { name: 'Selecionar uma opção', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => JSON.stringify({ ...sessionStorage })))
    .toContain('*********00');
  expect(
    await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage })),
  ).not.toContain(canary);
});

test('integrated audio fixtures use real gateway transport and no media upload', async ({
  page,
}) => {
  const media: string[] = [];
  page.on('request', (request) => {
    if (/\/v1\/media|\.(wav|ogg|webm)(\?|$)/.test(request.url())) media.push(request.url());
  });
  await page.getByRole('button', { name: 'Áudio demonstrativo' }).click();
  await page.getByRole('button', { name: /AUD-04/ }).click();
  await expect(page.getByText(/Não consegui compreender/)).toBeVisible();
  expect(media).toEqual([]);
});
