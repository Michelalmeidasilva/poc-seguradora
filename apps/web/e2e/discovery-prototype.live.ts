import { expect, test } from '@playwright/test';

test('offline prototype preserves choices and keyboard focus inside the single discovery Flow', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:8765/atlas-whatsapp.html#DES-01');
  const form = page.locator('#flow-form');
  await form.getByRole('radio', { name: /Telemedicina/ }).check();
  await form.getByRole('button', { name: 'Ver detalhes', exact: true }).click();
  await expect(form.locator('.sheet-header h3')).toBeFocused();
  await form.getByRole('button', { name: 'Ver planos', exact: true }).click();
  await form.getByRole('radio', { name: /^Individual/ }).check();
  await form.getByRole('button', { name: 'Voltar', exact: true }).click();
  await form.getByRole('button', { name: 'Ver planos', exact: true }).click();
  await expect(form.getByRole('radio', { name: /^Individual/ })).toBeChecked();
  await form.getByRole('radio', { name: /^Familiar/ }).check();
  await form.getByRole('button', { name: 'Ver condições', exact: true }).click();
  await form.getByRole('button', { name: 'Continuar', exact: true }).click();
  await form.getByRole('radio', { name: 'Iniciar contratação', exact: true }).check();
  await form.getByRole('button', { name: 'Voltar', exact: true }).click();
  await form.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(form.getByRole('radio', { name: 'Iniciar contratação', exact: true })).toBeChecked();
  await expect(page.locator('#screen-id')).toHaveText('DES-01');
  await page.screenshot({ path: test.info().outputPath('prototype-discovery-mobile.png') });
  await form.getByRole('button', { name: 'Concluir', exact: true }).click();
  await expect(page.locator('#screen-id')).toHaveText('IDE-01');
});
