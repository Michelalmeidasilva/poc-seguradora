import { expect, type Page } from '@playwright/test';

export async function sendChatText(page: Page, text: string) {
  const composer = page.getByRole('textbox', { name: 'Mensagem' });
  await expect(composer).toBeEnabled();
  await composer.fill(text);
  await composer.press('Enter');
}

export async function expectTextIdentityGate(page: Page) {
  await expect(page.getByText(/CPF.*11|11.*CPF/).last()).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Informar CPF', exact: true })).toHaveCount(0);
  // DES-01 and dependent registration remain legitimate Flow history.
  await expect(
    page.getByRole('group', { name: 'Formulário do assistente' }).filter({
      hasText: /Informar CPF|Informe um CPF com 11 dígitos para abrir a demonstração/i,
    }),
  ).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Mensagem' })).toBeEnabled();
}

export async function identifyByChat(page: Page, cpf = '11111111111') {
  await expectTextIdentityGate(page);
  await sendChatText(page, cpf);
  await expect(page.getByText('O formato do CPF foi aceito.', { exact: false })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Informar CPF' })).toHaveCount(0);
}
