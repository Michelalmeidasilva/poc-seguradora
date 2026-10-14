import { expect, test } from '@playwright/test';
import { expectTextIdentityGate, identifyByChat, sendChatText } from './identity-text.helpers';

test('typed identity rejects invalid whole messages and resumes the pending contract without a Flow', async ({
  page,
}) => {
  const identityFlows: string[] = [];
  page.on('request', (request) => {
    if (!request.url().endsWith('/v1/events') || request.method() !== 'POST') return;
    const event = request.postDataJSON();
    if (event.type === 'user.flow_submit' && /^IDE-/.test(event.payload.flowId))
      identityFlows.push(event.payload.flowId);
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Meu contrato', exact: true }).click();
  await expectTextIdentityGate(page);
  for (const invalid of [
    '12345',
    '111111111111',
    'abc11111111111xyz',
    'Meu CPF é 11111111111',
    '111.111.111/11',
  ]) {
    const responses = await page
      .getByText('O CPF precisa ter 11 dígitos.', { exact: false })
      .count();
    await sendChatText(page, invalid);
    await expect(page.getByText('O CPF precisa ter 11 dígitos.', { exact: false })).toHaveCount(
      responses + 1,
    );
    await expectTextIdentityGate(page);
    await expect(page.getByText('O formato do CPF foi aceito.', { exact: false })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ver contrato', exact: true })).toHaveCount(0);
  }
  await identifyByChat(page, '00000000000');
  await expect(page.getByRole('button', { name: 'Ver contrato', exact: true })).toBeVisible();
  expect(identityFlows).toEqual([]);
});

test('formatted eleven digits identify through chat without checksum validation', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Meu contrato', exact: true }).click();
  await identifyByChat(page, '111.111.111-11');
  await expect(page.getByRole('button', { name: 'Ver contrato', exact: true })).toBeVisible();
});
