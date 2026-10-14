import { expect, test, type Page } from '@playwright/test';
import { identifyByChat } from './identity-text.helpers';

const products = [
  ['Assistência Funeral', 'A Assistência Funeral oferece suporte ao titular e aos dependentes.'],
  ['Assistência Farmácia', 'A Assistência Farmácia oferece descontos em redes credenciadas.'],
  ['Telemedicina', 'A Telemedicina acontece no ambiente do prestador,'],
] as const;

async function openWelcome(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Digio Assistências' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Conhecer produtos', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fazer cotação' })).toHaveCount(0);
}

for (const [product, detail] of products) {
  test(`welcome opens ${product} through the product Flow without asking for CPF`, async ({
    page,
  }) => {
    await openWelcome(page);
    await page.getByRole('button', { name: 'Conhecer produtos', exact: true }).click();
    await page.getByRole('button', { name: 'Selecionar uma opção', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Conhecer produtos' });
    for (const [name] of products)
      await expect(dialog.getByRole('radio', { name: new RegExp(name) })).toBeVisible();
    await dialog.getByRole('radio', { name: new RegExp(product) }).check();
    await dialog.getByRole('button', { name: 'Ver detalhes', exact: true }).click();
    const details = page.getByRole('dialog', { name: 'Detalhes do serviço' });
    await expect(details.getByText(detail, { exact: false })).toBeVisible();
    await expect(details.getByRole('button', { name: 'Ver planos', exact: true })).toBeVisible();
    await expect(details.getByRole('button', { name: 'Voltar', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Informar CPF' })).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}

test('personal contract entry asks for CPF and accepts eleven digits without checksum', async ({
  page,
}) => {
  await openWelcome(page);
  await page.getByRole('button', { name: 'Meu contrato', exact: true }).click();
  await identifyByChat(page, '00000000000');
  await expect(page.getByText('O formato do CPF foi aceito.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ver contrato', exact: true })).toBeVisible();
});

test('unsupported insurance text keeps actionable assistance choices without showing legacy screens', async ({
  page,
}) => {
  await openWelcome(page);
  await page.getByRole('textbox', { name: 'Mensagem' }).fill('quero cotar meu carro');
  await page.getByRole('textbox', { name: 'Mensagem' }).press('Enter');
  await expect(page.getByText(/opções disponíveis/)).toBeVisible();
  const products = page.getByRole('button', { name: 'Conhecer produtos', exact: true }).last();
  await expect(products).toBeEnabled({ timeout: 5_000 });
  await products.click();
  await expect(
    page.getByRole('button', { name: 'Selecionar uma opção', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fazer cotação' })).toHaveCount(0);
});

for (const storedStatus of ['delivered', 'sent']) {
  test(`a reset session gets a fresh welcome with restored ${storedStatus} history`, async ({
    page,
    context,
  }) => {
    await openWelcome(page);
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem('seguradora-chat:v1') ?? ''))
      .toContain('Conhecer produtos');
    await page.evaluate((status) => {
      const key = 'seguradora-chat:v1';
      const snapshot = JSON.parse(sessionStorage.getItem(key)!);
      const user = snapshot.items.find((item: { kind: string }) => item.kind === 'user');
      user.status = status;
      sessionStorage.setItem(key, JSON.stringify(snapshot));
    }, storedStatus);
    await context.clearCookies();
    await page.reload();
    await expect(page.getByText('Uma nova conversa foi iniciada.', { exact: true })).toBeVisible();
    const welcome = page.getByRole('button', { name: 'Conhecer produtos', exact: true });
    await expect(welcome).toHaveCount(2);
    await expect(welcome.first()).toBeDisabled();
    await welcome.last().click();
    await page.getByRole('button', { name: 'Selecionar uma opção', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Conhecer produtos' })).toBeVisible();
  });
}

test('an unauthorized welcome is replayed with the same ID without a second greeting', async ({
  page,
}) => {
  const greetingIds: string[] = [];
  await page.route('**/v1/events', async (route) => {
    const event = route.request().postDataJSON();
    if (event.type === 'user.text' && event.payload.text === 'Oi') {
      greetingIds.push(event.id);
      if (greetingIds.length === 1) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'unauthorized' } }),
        });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    await route.continue();
  });
  await page.goto('/');
  await expect.poll(() => greetingIds.length).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Conhecer produtos', exact: true })).toBeVisible();
  expect(greetingIds).toHaveLength(2);
  expect(new Set(greetingIds).size).toBe(1);
  await expect(page.getByRole('button', { name: 'Conhecer produtos', exact: true })).toHaveCount(1);
});

test('retrying a restored greeting after unauthorized does not add a new welcome event', async ({
  page,
}) => {
  await openWelcome(page);
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('seguradora-chat:v1') ?? ''))
    .toContain('Conhecer produtos');
  const restoredId = await page.evaluate(() => {
    const key = 'seguradora-chat:v1';
    const snapshot = JSON.parse(sessionStorage.getItem(key)!);
    const user = snapshot.items.find((item: { kind: string }) => item.kind === 'user');
    user.status = 'failed';
    sessionStorage.setItem(key, JSON.stringify(snapshot));
    return user.id as string;
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
  const greetingIds: string[] = [];
  await page.route('**/v1/events', async (route) => {
    const event = route.request().postDataJSON();
    if (event.type === 'user.text' && event.payload.text === 'Oi') {
      greetingIds.push(event.id);
      if (greetingIds.length === 1) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'unauthorized' } }),
        });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    await route.continue();
  });
  await page.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(page.getByRole('button', { name: 'Conhecer produtos', exact: true })).toHaveCount(2);
  expect(greetingIds).toEqual([restoredId, restoredId]);
});
