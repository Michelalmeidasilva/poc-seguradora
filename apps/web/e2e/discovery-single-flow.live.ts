import { expect, test } from '@playwright/test';

for (const intent of ['finish', 'contract']) {
  test(`single discovery Flow keeps all details and plans local until ${intent}`, async ({
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
      await expect(modal().getByRole('button', { name: 'Ver planos', exact: true })).toBeVisible();
      expect(submissions).toHaveLength(0);
      await modal().getByRole('button', { name: 'Voltar', exact: true }).click();
    }
    await modal()
      .getByRole('radio', { name: /Telemedicina/ })
      .check();
    await modal().getByRole('button', { name: 'Ver detalhes', exact: true }).click();
    await modal().getByRole('button', { name: 'Ver planos', exact: true }).click();
    await expect(modal().getByRole('heading', { name: 'Comparação de planos' })).toBeVisible();
    for (const plan of ['Individual', 'Familiar']) {
      await modal()
        .getByRole('radio', { name: new RegExp(`^${plan}`) })
        .check();
      await modal().getByRole('button', { name: 'Ver condições', exact: true }).click();
      await expect(modal().getByRole('heading', { name: plan, exact: true })).toBeVisible();
      await expect(
        modal().getByText(
          plan === 'Individual'
            ? 'Somente titular.'
            : 'Titular e até 3 dependentes elegíveis neste exemplo.',
          { exact: true },
        ),
      ).toBeVisible();
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await expect(
          modal().getByRole('button', { name: 'Continuar', exact: true }),
        ).toBeInViewport();
        await page.screenshot({
          path: test.info().outputPath(`discovery-${intent}-${plan}-${width}.png`),
        });
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await modal().getByRole('button', { name: 'Voltar', exact: true }).click();
      expect(submissions).toHaveLength(0);
    }
    await modal()
      .getByRole('radio', { name: /^Individual/ })
      .check();
    await modal().getByRole('button', { name: 'Ver condições', exact: true }).click();
    await modal().getByRole('button', { name: 'Continuar', exact: true }).click();
    await modal()
      .getByRole('radio', {
        name: intent === 'contract' ? 'Iniciar contratação' : 'Concluir descoberta',
        exact: true,
      })
      .check();
    expect(submissions).toHaveLength(0);
    await expect(page.getByRole('button', { name: 'Informar CPF', exact: true })).toHaveCount(0);
    await modal().getByRole('button', { name: 'Concluir', exact: true }).click();
    await expect.poll(() => submissions.length).toBe(1);
    expect(submissions[0]).toMatchObject({
      flowId: 'DES-01',
      data: { intent, service: '2', modality: 'individual' },
    });
    await expect(modal()).toHaveCount(0);
    if (intent === 'contract') {
      await page.getByRole('button', { name: 'Informar CPF', exact: true }).click();
      await page.getByRole('button', { name: 'Abrir formulário', exact: true }).click();
      await modal().getByLabel('CPF', { exact: true }).fill('11111111111');
      await modal().getByRole('button', { name: 'Validar formato', exact: true }).click();
      await expect(
        page.getByText('Você escolheu Serviços de Assistência Individual.', { exact: false }),
      ).toBeVisible();
    } else
      await expect(
        page.getByText('Tudo bem. Você pode retomar por aqui.', { exact: false }),
      ).toBeVisible();
  });
}
