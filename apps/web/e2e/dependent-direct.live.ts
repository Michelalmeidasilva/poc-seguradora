import { expect, test, type Page } from '@playwright/test';

async function say(page: Page, text: string) {
  const input = page.getByRole('textbox', { name: 'Mensagem', exact: true });
  await input.fill(text);
  await input.press('Enter');
}
async function chooseContract(page: Page, identify = true) {
  await say(page, 'Incluir dependente');
  if (identify) {
    await expect(page.getByText('Para continuar, informe seu CPF', { exact: false })).toBeVisible();
    await say(page, '11111111111');
  }
  const dialog = page.getByRole('dialog', { name: 'Selecionar contrato' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: /Familiar/ }).check();
  await dialog.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Seu plano tem 2 vagas disponíveis', { exact: false })).toBeVisible();
}

test('dependent entry asks CPF once and reuses it when returning to contract selection', async ({
  page,
}) => {
  await page.goto('/');
  await chooseContract(page);
  await expect(page.getByRole('button', { name: 'Continuar inclusão', exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByText('Você pode preencher o formulário ou enviar os dados aqui no chat.', {
      exact: false,
    }),
  ).toBeVisible();
  await say(page, 'menu');
  await expect(page.getByRole('button', { name: 'Selecionar uma opção', exact: true })).toHaveCount(
    2,
  );
  await say(page, 'Incluir dependente');
  await expect(page.getByRole('dialog', { name: 'Selecionar contrato' })).toBeVisible();
  await expect(page.getByText('Para continuar, informe seu CPF', { exact: false })).toHaveCount(1);
});

test('the form opens in one click and validates required CPF and phone before review', async ({
  page,
}) => {
  await page.goto('/');
  await chooseContract(page);
  await page.getByRole('button', { name: 'Preencher formulário', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Incluir dependente' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Nome completo', { exact: true })).toBeEmpty();
  await expect(dialog.getByLabel('Data de nascimento', { exact: true })).toBeEmpty();
  await dialog.getByLabel('Nome completo', { exact: true }).fill('Beatriz Costa');
  await dialog.getByLabel('Data de nascimento', { exact: true }).fill('2014-03-12');
  await dialog.getByLabel('CPF', { exact: true }).fill('123');
  await dialog.getByLabel('CPF', { exact: true }).press('Tab');
  await expect(dialog.getByText('Informe um CPF com 11 dígitos.', { exact: true })).toBeVisible();
  await dialog.getByLabel('CPF', { exact: true }).fill('98765432100');
  await dialog.getByLabel('Parentesco', { exact: true }).selectOption('Filha');
  await dialog.getByLabel('Celular do dependente', { exact: true }).fill('123');
  await dialog.getByLabel('Celular do dependente', { exact: true }).press('Tab');
  await expect(dialog.getByText('Informe um telefone válido', { exact: true })).toBeVisible();
  await dialog.getByLabel('Celular do dependente', { exact: true }).fill('11988887777');
  await dialog
    .getByLabel('Sexo biológico (informado pela pessoa)', { exact: true })
    .selectOption('Prefiro não informar');
  await dialog.getByRole('button', { name: 'Revisar inclusão', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Enviar formulário', exact: true })
    .click();
  dialog = page.getByRole('dialog', { name: 'Revisar inclusão' });
  await expect(dialog.getByText('Beatriz Costa', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Prefiro não informar', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirmar inclusão', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Recebi sua confirmação.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Consultar resultado', exact: true }).click();
  await expect(page.getByText('Beatriz Costa está vinculada', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage }))).not.toContain(
    '98765432100',
  );
});

for (const partial of [false, true]) {
  test(`chat validates all six fields before explicit confirmation; partial=${partial}`, async ({
    page,
  }) => {
    await page.goto('/');
    await chooseContract(page);
    const first =
      'Nome completo: João Costa; CPF: 98765432100; Data de nascimento: 12/03/2014; Parentesco: Filho';
    if (partial) {
      await say(page, first);
      const missing = page.getByText('Para completar o cadastro, informe apenas', { exact: false });
      await expect(missing).toContainText('Celular do dependente');
      await expect(missing).toContainText('Sexo biológico');
      await expect(missing).not.toContainText('CPF');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await say(page, 'Celular: 123; Sexo biológico: Prefiro não informar');
      await expect(
        page.getByText('Para completar o cadastro, informe apenas', { exact: false }).last(),
      ).toContainText('Celular do dependente');
      await say(page, '11988887777');
    } else {
      await say(page, `${first}; Celular: 11988887777; Sexo biológico: Prefiro não informar`);
    }
    const dialog = page.getByRole('dialog', { name: 'Revisar inclusão' });
    await expect(dialog.getByText('João Costa', { exact: true })).toBeVisible();
    await expect(dialog.getByText('11988887777', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Prefiro não informar', { exact: true })).toBeVisible();
    await expect(dialog.getByText('1 vaga', { exact: true })).toBeVisible();
    await expect(page.getByText('Recebi sua confirmação.', { exact: false })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Confirmar inclusão', exact: true }).click();
    await expect(page.getByText('Recebi sua confirmação.', { exact: false })).toBeVisible();
  });
}

test('offline dependent entry also asks only missing chat data before review', async ({ page }) => {
  await page.goto('http://127.0.0.1:4187/atlas-whatsapp.html#DEP-01');
  await say(page, '11111111111');
  const form = page.locator('#flow-form');
  await expect(form).toHaveAccessibleName('Selecionar contrato');
  await form.getByRole('radio', { name: /Familiar/ }).check();
  await form.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Preencher formulário', exact: true }).click();
  await form.getByLabel('Celular do dependente', { exact: true }).fill('123');
  await form.getByRole('button', { name: 'Fechar formulário' }).click();
  await say(
    page,
    'Nome completo: João Costa; CPF: 98765432100; Data de nascimento: 12/03/2014; Parentesco: Filho',
  );
  await expect(
    page.getByText('Para completar o cadastro, informe apenas', { exact: false }),
  ).toContainText('Celular');
  await say(page, 'Celular: 11988887777; Sexo biológico: Prefiro não informar');
  await expect(form).toHaveAccessibleName('Revisar inclusão');
  await expect(form.getByText('João Costa', { exact: true })).toBeVisible();
});
