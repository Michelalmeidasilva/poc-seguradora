import { expect, test } from '@playwright/test';
import { identifyByChat } from './identity-text.helpers';

test('includes a dependent from one sentence then schedules and undoes exclusion through the real stack', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Conhecer produtos', exact: true })).toBeVisible();
  const message = page.getByRole('textbox', { name: 'Mensagem' });
  await message.fill(
    'Quero incluir minha filha Ana Lima no plano. O CPF dela é 987.654.321-00 e ela nasceu em 20/05/2012.',
  );
  await message.press('Enter');
  await identifyByChat(page);
  let dialog = page.getByRole('dialog');
  await expect(page.getByText('Entendi os dados de Ana Lima:', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Completar dados', exact: true }).last().click();
  // Open the dependent registration form belonging to this request.
  await page
    .getByRole('group', { name: 'Formulário do assistente' })
    .filter({ hasText: 'Qual é o celular de Ana Lima' })
    .getByRole('button', { name: 'Abrir formulário', exact: true })
    .click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Celular do dependente', { exact: true }).fill('11987654321');
  await dialog
    .getByLabel('Sexo biológico informado', { exact: true })
    .selectOption('Prefiro não informar');
  await dialog.getByRole('button', { name: 'Revisar inclusão', exact: true }).click();
  await dialog.getByRole('button', { name: 'Enviar formulário', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir revisão', exact: true }).last().click();
  dialog = page.getByRole('dialog', { name: 'Revisar inclusão' });
  await expect(dialog.locator('.flow-review-line').filter({ hasText: 'Nome' })).toContainText(
    'Ana Lima',
  );
  await expect(dialog.locator('.flow-review-line').filter({ hasText: 'CPF' })).not.toContainText(
    '98765432100',
  );
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: test.info().outputPath(`DEP-06-${width}.png`) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.getByRole('button', { name: 'Confirmar inclusão', exact: true }).click();
  await expect(page.getByText('Recebi sua confirmação.', { exact: false }).last()).toBeVisible();
  await expect(message).toBeEnabled();
  await message.fill('Quero excluir a Maria.');
  await message.press('Enter');
  await page.getByRole('button', { name: 'Selecionar uma opção', exact: true }).last().click();
  dialog = page.getByRole('dialog', { name: 'Excluir dependente' });
  await expect(dialog.getByRole('radio', { name: /Ana Lima/ })).toBeVisible();
  await expect(dialog.getByRole('radio', { name: /Maria Silva/ })).toBeVisible();
  await dialog.getByRole('radio', { name: /Ana Lima/ }).check();
  await dialog.getByRole('button', { name: 'Consultar efeitos', exact: true }).click();
  await page.getByRole('button', { name: 'Revisar exclusão', exact: true }).last().click();
  await page.getByRole('button', { name: 'Abrir revisão', exact: true }).last().click();
  dialog = page.getByRole('dialog', { name: 'Excluir dependente' });
  await expect(dialog.locator('.flow-review-line').filter({ hasText: 'Pessoa' })).toContainText(
    'Ana Lima',
  );
  await page.screenshot({ path: test.info().outputPath('EXC-03-390.png') });
  await dialog.getByRole('button', { name: 'Confirmar exclusão', exact: true }).click();
  await page.getByRole('button', { name: 'Consultar resultado', exact: true }).last().click();
  await expect(
    page.getByText('A exclusão de Ana Lima está agendada', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Ver agendamento', exact: true }).last().click();
  await page.getByRole('button', { name: 'Desfazer exclusão', exact: true }).last().click();
  await page.getByRole('button', { name: 'Confirmar manutenção', exact: true }).last().click();
  await page.getByRole('button', { name: 'Consultar resultado', exact: true }).last().click();
  await expect(
    page.getByText('O agendamento de exclusão foi desfeito.', { exact: false }),
  ).toBeVisible();
});
