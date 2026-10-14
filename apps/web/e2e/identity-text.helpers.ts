import { expect, type Page } from '@playwright/test';

export async function sendChatText(page: Page, text: string) {
  const composer = page.getByRole('textbox', { name: 'Mensagem' });
  await expect(composer).toBeEnabled();
  await composer.fill(text);
  await composer.press('Enter');
}

export async function expectTextIdentityGate(page: Page) {
  await expect(page.getByText(/informe seu CPF|CPF precisa ter/i).last()).toBeVisible();
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
  const replies = () =>
    page.getByRole('group', { name: /^(Mensagem|Formulário) do assistente$/ }).count();
  const before = await replies();
  await sendChatText(page, cpf);
  await expect.poll(replies).toBeGreaterThan(before);
  await expect(page.getByText('Recebi seu CPF. Vamos continuar.', { exact: true })).toHaveCount(0);
  await expect(
    page.getByText('Tudo pronto. Vamos continuar seu pedido.', { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Informar CPF' })).toHaveCount(0);
}
