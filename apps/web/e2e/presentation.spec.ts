import { devices, expect, test, type Page } from '@playwright/test';

async function posted(page: Page) {
  const sid = (await page.context().cookies()).find((cookie) => cookie.name === 'sid')?.value ?? '';
  const response = await page.request.get('http://127.0.0.1:8099/__posted', {
    headers: { cookie: `sid=${sid}` },
  });
  const body = (await response.json()) as {
    posted: { type: string; payload: Record<string, unknown> }[];
  };
  return body.posted.filter((event) =>
    ['user.text', 'user.quick_reply', 'user.flow_submit', 'user.flow_data_exchange'].includes(
      event.type,
    ),
  );
}

test('switches devices and catalog without losing the actual conversation or draft', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Fazer cotação', exact: true })).toBeVisible();
  const input = page.getByRole('textbox', { name: 'Mensagem', exact: true });
  await input.fill('Meu pedido real');
  await input.press('Enter');
  await expect(page.getByText('Você disse: Meu pedido real', { exact: true })).toBeVisible();
  await input.fill('Rascunho preservado');
  await page.getByRole('button', { name: 'Android', exact: true }).click();
  await expect(page.locator('.experience__device')).toHaveAttribute('data-device', 'android');
  await page.getByRole('tab', { name: 'Catálogo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Catálogo', exact: true })).toBeVisible();
  await expect(input).toBeHidden();
  await page.getByRole('button', { name: 'Desktop', exact: true }).click();
  await page.getByRole('tab', { name: 'Conversa', exact: true }).click();
  await expect(input).toHaveValue('Rascunho preservado');
  await expect(page.getByText('Você disse: Meu pedido real', { exact: true })).toBeVisible();
  await expect
    .poll(
      async () =>
        (await posted(page)).filter(
          (event) => event.type === 'user.text' && event.payload.text === 'Oi',
        ).length,
    )
    .toBe(1);
});

test('system theme follows OS changes and explicit themes override them', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Claro', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Escuro', exact: true }).click();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Sistema', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('catalog actions and forms remain local and render inside the selected device', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Fazer cotação', exact: true })).toBeVisible();
  const before = await posted(page);
  await page.getByRole('tab', { name: 'Catálogo', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('catalog-iphone.png'), fullPage: true });
  await page.getByRole('button', { name: 'Conhecer plano', exact: true }).first().click();
  await expect(
    page.getByRole('status', { name: 'Resultado do exemplo', exact: true }),
  ).toContainText('Exemplo selecionado');
  await page.getByRole('button', { name: 'Abrir Condições do plano.pdf', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Condições do plano.pdf', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir formulário', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Solicitar assistência', exact: true });
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('catalog-form.png'), fullPage: true });
  const withinDevice = await page.locator('.flow-sheet').evaluate((element) => {
    const frame = element.closest('.experience__device')!.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    return {
      frame: { x: frame.x, y: frame.y, right: frame.right, bottom: frame.bottom },
      rect: { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom },
      position: getComputedStyle(element).position,
      inside:
        rect.x >= frame.x &&
        rect.y >= frame.y &&
        rect.right <= frame.right &&
        rect.bottom <= frame.bottom,
    };
  });
  expect(withinDevice.inside, JSON.stringify(withinDevice)).toBe(true);
  await dialog.getByRole('textbox', { name: /Nome completo/ }).fill('Pessoa de exemplo');
  await dialog.getByRole('radio', { name: 'Eletricista', exact: true }).check();
  await expect(
    dialog.getByText('Eletricista: apoio em reparos elétricos.', { exact: true }),
  ).toBeVisible();
  await dialog.getByRole('checkbox', { name: 'Li as condições do exemplo', exact: true }).check();
  await expect(
    dialog.getByText('Condições aceitas. Você pode concluir o exemplo.', { exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Concluir exemplo', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('status', { name: 'Resultado do exemplo', exact: true }),
  ).toContainText('Exemplo concluído');
  expect(await posted(page)).toEqual(before);
  await page.getByRole('tab', { name: 'Conversa', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Fazer cotação', exact: true })).toBeVisible();
});

test('real chat Flows still open through the gateway and restore opener focus', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Fazer cotação', exact: true })).toBeVisible();
  const input = page.getByRole('textbox', { name: 'Mensagem', exact: true });
  await input.fill('cotacao flow');
  await input.press('Enter');
  const opener = page.getByRole('button', { name: 'Abrir cotação', exact: true });
  await opener.click();
  await expect(page.getByRole('dialog', { name: 'Cotação', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(opener).toBeFocused();
});

for (const [preset, os] of [
  ['iPhone 13', 'iphone'],
  ['Pixel 7', 'android'],
] as const) {
  test.describe(`${os} native presentation`, () => {
    const phone = devices[preset];
    test.use({
      viewport: phone.viewport,
      userAgent: phone.userAgent,
      deviceScaleFactor: phone.deviceScaleFactor,
      isMobile: phone.isMobile,
      hasTouch: phone.hasTouch,
    });
    test('detects OS, fills viewport and exposes settings and catalog', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('.experience__device')).toHaveAttribute('data-device', os);
      const native = await page.locator('.experience__device').evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.x === 0 &&
          rect.y === 0 &&
          Math.abs(rect.width - innerWidth) < 1 &&
          Math.abs(rect.height - innerHeight) < 1 &&
          document.documentElement.scrollWidth <= innerWidth
        );
      });
      expect(native).toBe(true);
      await page
        .getByRole('button', { name: 'Configurações de visualização', exact: true })
        .click();
      const settings = page.getByRole('dialog', { name: 'Visualização', exact: true });
      await expect(settings).toBeVisible();
      await settings.getByRole('button', { name: 'Escuro', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await settings.getByRole('tab', { name: 'Catálogo', exact: true }).click();
      await expect(settings).toBeHidden();
      await expect(page.getByRole('heading', { name: 'Catálogo', exact: true })).toBeVisible();
      await page
        .getByRole('button', { name: 'Configurações de visualização', exact: true })
        .click();
      await page.keyboard.press('Escape');
      await expect(settings).toBeHidden();
      await expect(
        page.getByRole('button', { name: 'Configurações de visualização', exact: true }),
      ).toBeFocused();
    });
  });
}
