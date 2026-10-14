import { expect, test } from '@playwright/test';

for (const [service, plan, payment, price] of [
  ['Telemedicina', 'Individual', 'Cartão cadastrado •• 2048', 'R$ 29,90/mês'],
  ['Assistência Farmácia', 'Familiar', 'Outro meio disponível', 'R$ 39,90/mês'],
  ['Assistência Funeral', 'Familiar', 'Cartão cadastrado •• 2048', 'R$ 39,90/mês'],
]) {
  test(`${service} ${plan}: holder and payment reach confirmation in one Flow`, async ({
    page,
  }) => {
    const submissions: Array<{ flowId: string; data: Record<string, unknown> }> = [];
    page.on('request', (request) => {
      if (request.method() !== 'POST' || !request.url().endsWith('/v1/events')) return;
      const event = request.postDataJSON();
      if (event.type === 'user.flow_submit') submissions.push(event.payload);
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Conhecer produtos', exact: true }).click();
    await page.getByRole('button', { name: 'Selecionar uma opção', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('radio', { name: new RegExp(service!) }).check();
    await dialog.getByRole('button', { name: 'Ver detalhes' }).click();
    await dialog.getByRole('button', { name: 'Escolher plano' }).click();
    await dialog.getByRole('radio', { name: new RegExp(`^${plan}`) }).check();
    await dialog.getByLabel('CPF', { exact: true }).fill('12345678900');
    await dialog.getByRole('button', { name: 'Continuar contratação' }).click();
    await expect(page.getByText('Você escolheu', { exact: false })).toHaveCount(0);
    await expect(dialog).toHaveAccessibleName('Dados e pagamento');
    await expect(dialog.getByLabel('Nome completo')).toBeEmpty();
    await dialog.getByLabel('Nome completo').fill('Beatriz Costa');
    await dialog.getByLabel('E-mail para documentos').fill('beatriz@example.com');
    await dialog.getByLabel('Forma de pagamento').selectOption(payment!);
    await dialog.getByRole('button', { name: 'Revisar contratação' }).click();
    await expect(dialog).toHaveAccessibleName('Revisar contratação');
    await expect(dialog.getByText(`${service} ${plan}`, { exact: true })).toBeVisible();
    await expect(dialog.getByText(price!, { exact: true })).toBeVisible();
    await expect(dialog.getByText(`Forma de pagamento: ${payment}`, { exact: true })).toBeVisible();
    await expect(dialog.getByRole('checkbox')).not.toBeChecked();
    await expect(dialog.getByRole('button', { name: 'Confirmar contratação' })).toBeDisabled();
    expect(submissions.map(({ flowId }) => flowId)).toEqual(['DES-01']);
    await dialog.getByRole('button', { name: 'Voltar', exact: true }).click();
    await expect(dialog.getByLabel('Nome completo')).toHaveValue('Beatriz Costa');
    await expect(dialog.getByLabel('Forma de pagamento')).toHaveValue(payment!);
    await dialog.getByRole('button', { name: 'Revisar contratação' }).click();
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: 'Confirmar contratação' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('Recebi sua confirmação.', { exact: false })).toBeVisible();
    expect(submissions.map(({ flowId }) => flowId)).toEqual(['DES-01', 'ADE-03']);
    expect(submissions[1]!.data).toEqual({
      holder: 'Beatriz Costa',
      email: 'beatriz@example.com',
      payment,
      consent: true,
    });
    await expect(page.getByRole('button', { name: 'Escolher pagamento', exact: true })).toHaveCount(
      0,
    );
    await page.getByRole('button', { name: 'Consultar resultado', exact: true }).click();
    await expect(page.getByText('Contratação concluída', { exact: false }).last()).toBeVisible();
  });
}

test('offline atlas keeps contracting review and consent inside one Flow', async ({ page }) => {
  await page.goto('http://127.0.0.1:4187/atlas-whatsapp.html#ADE-03');
  await page.getByRole('textbox', { name: 'Mensagem', exact: true }).fill('12345678900');
  await page.getByRole('textbox', { name: 'Mensagem', exact: true }).press('Enter');
  // The atlas automatically opens the pending form after the CPF gate.
  const flow = page.locator('#flow-form');
  await flow.getByLabel('Nome completo').fill('Beatriz Costa');
  await flow.getByLabel('E-mail para documentos').fill('beatriz@example.com');
  await flow.getByLabel('Forma de pagamento').selectOption('Outro meio disponível');
  await flow.getByRole('button', { name: 'Revisar contratação' }).click();
  await expect(flow).toHaveAccessibleName('Revisar contratação');
  await expect(flow.getByRole('checkbox')).not.toBeChecked();
  await flow.getByRole('checkbox').check();
  await flow.getByRole('button', { name: 'Voltar', exact: true }).click();
  await expect(flow.getByLabel('Nome completo')).toHaveValue('Beatriz Costa');
  await flow.getByLabel('Forma de pagamento').selectOption('Cartão cadastrado •• 2048');
  await flow.getByRole('button', { name: 'Revisar contratação' }).click();
  await expect(flow.getByRole('checkbox')).not.toBeChecked();
  await flow.getByRole('checkbox').check();
  await flow.getByRole('button', { name: 'Confirmar contratação' }).click();
  await expect(page).toHaveURL(/#ADE-08$/);
});
