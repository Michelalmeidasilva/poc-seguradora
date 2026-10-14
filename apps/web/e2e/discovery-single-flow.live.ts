import { expect, test } from '@playwright/test';

for (const plan of ['Individual', 'Familiar']) {
  test(`discovery continues the selected ${plan} contract and reuses identification`, async ({
    page,
  }) => {
    const submissions: Array<Record<string, unknown>> = [];
    page.on('request', (request) => {
      if (!request.url().endsWith('/v1/events') || request.method() !== 'POST') return;
      const event = request.postDataJSON();
      if (event.type === 'user.flow_submit') submissions.push(event.payload);
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Conhecer produtos', exact: true }).click();
    await page.getByRole('button', { name: 'Selecionar uma opção', exact: true }).click();
    const modal = () => page.getByRole('dialog');
    for (const [service, detail] of [
      ['Assistência Funeral', /suporte ao titular e aos dependentes/i],
      ['Assistência Farmácia', /descontos em redes credenciadas/i],
      ['Telemedicina', /ambiente do prestador/i],
    ] as const) {
      await modal()
        .getByRole('radio', { name: new RegExp(service) })
        .check();
      await modal().getByRole('button', { name: 'Ver detalhes', exact: true }).click();
      await expect(modal().getByText(detail)).toBeVisible();
      await expect(modal().getByText('R$ 29,90/mês', { exact: true })).toBeVisible();
      await expect(modal().getByText('R$ 39,90/mês', { exact: true })).toBeVisible();
      await expect(modal().getByLabel('CPF', { exact: true })).toHaveCount(0);
      expect(submissions).toHaveLength(0);
      await modal().getByRole('button', { name: 'Voltar', exact: true }).click();
    }
    await modal().getByRole('button', { name: 'Ver detalhes', exact: true }).click();
    await page.screenshot({ path: test.info().outputPath(`details-${plan}.png`) });
    await modal().getByRole('button', { name: 'Escolher plano', exact: true }).click();
    await modal()
      .getByRole('radio', { name: new RegExp(`^${plan}`) })
      .check();
    await modal().getByLabel('CPF', { exact: true }).fill('12345');
    await modal().getByLabel('CPF', { exact: true }).press('Tab');
    await expect(
      modal().getByRole('button', { name: 'Continuar contratação', exact: true }),
    ).toBeDisabled();
    await expect(
      modal().getByText('Informe um CPF com 11 dígitos.', { exact: true }),
    ).toBeVisible();
    expect(submissions).toHaveLength(0);
    await modal().getByLabel('CPF', { exact: true }).fill('123.456.789-00');
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await expect(
        modal().getByRole('button', { name: 'Continuar contratação', exact: true }),
      ).toBeInViewport();
      await page.screenshot({ path: test.info().outputPath(`contract-${plan}-${width}.png`) });
    }
    await modal().getByRole('button', { name: 'Continuar contratação', exact: true }).click();
    await expect.poll(() => submissions.length).toBe(1);
    expect(submissions[0]).toMatchObject({
      flowId: 'DES-01',
      data: { intent: 'contract', service: '2', modality: plan.toLowerCase() },
    });
    await expect(modal()).toHaveCount(0);
    await expect(
      page.getByText(`Você escolheu Telemedicina ${plan}.`, { exact: false }),
    ).toBeVisible();
    // Revisit the selected service from the chat, keeping both choices and the valid gate.
    const discoveryOpeners = page.getByRole('button', {
      name: 'Selecionar uma opção',
      exact: true,
    });
    const previousOpeners = await discoveryOpeners.count();
    await page.getByRole('button', { name: 'Rever planos', exact: true }).last().click();
    await expect(discoveryOpeners).toHaveCount(previousOpeners + 1);
    await discoveryOpeners.last().click();
    await expect(modal().getByRole('radio', { name: /Telemedicina/ })).toBeChecked();
    await modal().getByRole('button', { name: 'Ver detalhes', exact: true }).click();
    await modal().getByRole('button', { name: 'Escolher plano', exact: true }).click();
    await expect(modal().getByRole('radio', { name: new RegExp(`^${plan}`) })).toBeChecked();
    await expect(modal().getByLabel('CPF', { exact: true })).toHaveCount(0);
    const continueButtons = page.getByRole('button', { name: 'Continuar', exact: true });
    const previousContinues = await continueButtons.count();
    await modal().getByRole('button', { name: 'Continuar contratação', exact: true }).click();
    await expect.poll(() => submissions.length).toBe(2);
    await expect(continueButtons).toHaveCount(previousContinues + 1);
    await expect(continueButtons.last()).toBeEnabled();
    expect((submissions[1]!.data as Record<string, unknown>).cpf).toBeUndefined();
    await continueButtons.last().click();
    await page.getByRole('button', { name: 'Abrir formulário', exact: true }).last().click();
    await expect(modal().getByLabel('Nome completo', { exact: true })).toBeVisible();
    await expect(modal().getByLabel('CPF', { exact: true })).toHaveCount(0);
    await modal().getByRole('button', { name: 'Fechar', exact: true }).click();

    expect(
      await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage })),
    ).not.toContain('123.456.789-00');
  });
}
