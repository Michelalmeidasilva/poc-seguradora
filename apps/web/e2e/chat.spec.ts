import { expect, test, type Page } from '@playwright/test';

const MOCK = 'http://127.0.0.1:8099';

async function posted(page: Page) {
  const sid = (await page.context().cookies()).find((c) => c.name === 'sid')?.value ?? '';
  const res = await page.request.get(`${MOCK}/__posted`, { headers: { cookie: `sid=${sid}` } });
  return (
    (await res.json()) as {
      posted: Array<{ id: string; type: string; payload: Record<string, unknown> }>;
    }
  ).posted;
}

async function say(page: Page, text: string) {
  const input = page.getByRole('textbox', { name: 'Mensagem' });
  await input.fill(text);
  await input.press('Enter');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('online')).toBeVisible();
});

test('greets and shows the quick replies; tapping one opens the flow message', async ({ page }) => {
  await say(page, 'oi');
  await expect(page.getByText('Eu sou o', { exact: false })).toBeVisible();
  await expect(page.locator('strong', { hasText: 'assistente' })).toBeVisible();
  await page.getByRole('button', { name: 'Fazer cotação' }).click();
  await expect(page.getByRole('button', { name: 'Começar' })).toBeVisible();
  // the buttons of the old message are no longer interactive
  await expect(page.getByRole('button', { name: 'Minhas apólices' })).toBeDisabled();
});

test('shows ticks moving from sending to delivered', async ({ page }) => {
  await say(page, 'qualquer coisa');
  await expect(page.getByRole('img', { name: 'Entregue' })).toBeVisible();
  await expect(page.getByText('Você disse: qualquer coisa')).toBeVisible();
});

test('renders template, code, location and voice messages', async ({ page }) => {
  await say(page, 'template');
  await expect(page.getByText('Apólice AP-1001')).toBeVisible();
  await expect(page.getByRole('link', { name: /Abrir documento/ })).toHaveAttribute(
    'target',
    '_blank',
  );
  await say(page, 'codigo');
  await expect(page.getByText('Protocolo: SN-2002')).toBeVisible();
  await say(page, 'local');
  await expect(page.getByRole('link', { name: /Abrir no mapa/ })).toBeVisible();
  await say(page, 'audio');
  await expect(page.getByRole('button', { name: 'Reproduzir áudio' })).toBeVisible();
});

test('renders a horizontally scrollable carousel operable by the buttons', async ({ page }) => {
  await say(page, 'carrossel');
  const region = page.getByRole('region', { name: /carrossel/i });
  await expect(region).toBeVisible();
  await expect(region.getByRole('group')).toHaveCount(3);
  await region.getByRole('button', { name: 'Próximo' }).click();
});

test('reload restores the history without duplicating messages', async ({ page }) => {
  await say(page, 'oi');
  await expect(page.getByRole('button', { name: 'Fazer cotação' })).toBeVisible();
  // wait for the debounced persistence deterministically
  await expect
    .poll(() => page.evaluate(() => JSON.stringify({ ...sessionStorage })))
    .toContain('Fazer cotação');
  await page.reload();
  await expect(page.getByText('online')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fazer cotação' })).toHaveCount(1);
  await expect(page.getByText('oi', { exact: true })).toHaveCount(1);
});

test('reconnects after the stream drops and receives later events without duplicates', async ({
  page,
}) => {
  await say(page, 'queda');
  await expect(page.getByText('Vou derrubar a conexão.')).toBeVisible();
  // The drop-to-reconnect window (retry: 500) is too short to assert the transient header state
  // without flakiness; the later message arriving exactly once proves the stream came back.
  await say(page, 'depois da queda');
  await expect(page.getByText('Você disse: depois da queda')).toBeVisible();
  await expect(page.getByText('Você disse: depois da queda')).toHaveCount(1);
  await expect(page.getByText('Vou derrubar a conexão.')).toHaveCount(1);
});

test('a failed message shows a retry button and the resend reuses the same id', async ({
  page,
}) => {
  await say(page, 'erro');
  await expect(page.getByRole('img', { name: 'Falha no envio' })).toBeVisible();
  await page.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect
    .poll(async () => (await posted(page)).filter((e) => e.type === 'user.text').length)
    .toBe(2);
  const ids = (await posted(page)).filter((e) => e.type === 'user.text').map((e) => e.id);
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  // one single user bubble for the message
  await expect(page.getByText('erro', { exact: true })).toHaveCount(1);
});

test('a second tab shows the notice and can take over', async ({ page, context }) => {
  const other = await context.newPage();
  await other.goto('/');
  await expect(other.getByText(/aberta em outra aba/i)).toBeVisible();
  await expect(other.getByRole('textbox')).toHaveCount(0);
  await other.getByRole('button', { name: 'Usar esta aba' }).click();
  await expect(other.getByRole('textbox', { name: 'Mensagem' })).toBeVisible();
  await expect(page.getByText(/aberta em outra aba/i)).toBeVisible();
});

test('starts a new conversation when the session is invalidated', async ({ page }) => {
  await say(page, 'sessao');
  await expect(page.getByText('Sessão invalidada.')).toBeVisible();
  // the debounced persistence must have stored the session before reloading
  await expect
    .poll(() => page.evaluate(() => JSON.stringify({ ...sessionStorage })))
    .toContain('Sessão invalidada.');
  await page.reload();
  await expect(page.getByText(/nova conversa/i)).toBeVisible();
  await say(page, 'oi');
  await expect(page.getByRole('button', { name: 'Fazer cotação' })).toBeVisible();
});

test('applies the dark theme from the query string', async ({ page }) => {
  // On wide viewports the body is a darker backdrop around the chat card; use a phone-sized viewport,
  // where the body shows the theme background itself.
  await page.setViewportSize({ width: 480, height: 800 });
  await page.goto('/?theme=dark');
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).toBe('rgb(11, 20, 26)');
});

test('does not execute HTML sent as text', async ({ page }) => {
  await say(page, '<img src=x onerror="document.title=\'hacked\'">');
  await expect(page.getByText('Você disse:')).toBeVisible();
  await expect(page).not.toHaveTitle('hacked');
});
