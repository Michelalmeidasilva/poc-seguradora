import { expect, test, type Locator, type Page } from '@playwright/test';

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

  // Tab B's takeover replaced the shared sid cookie. Going back to tab A (which still holds its
  // saved, now foreign session) must recover on its own instead of bricking.
  await page.bringToFront();
  await page.getByRole('button', { name: 'Usar esta aba' }).click();
  await expect(page.getByRole('textbox', { name: 'Mensagem' })).toBeVisible();
  await say(page, 'depois da troca');
  await expect(page.getByText('Uma nova conversa foi iniciada.')).toBeVisible();
  await expect(page.getByText('Você disse: depois da troca')).toBeVisible();
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

// ---- Flows ------------------------------------------------------------------------------

type FlowEvent = { type: string; payload: Record<string, unknown> };

async function flowEvents(page: Page): Promise<FlowEvent[]> {
  const sid = (await page.context().cookies()).find((c) => c.name === 'sid')?.value ?? '';
  const res = await page.request.get(`${MOCK}/__events`, { headers: { cookie: `sid=${sid}` } });
  return ((await res.json()) as { events: FlowEvent[] }).events;
}

/** Presses Tab until `target` has the focus (keyboard-only navigation). */
async function tabTo(page: Page, target: Locator, max = 40) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

/** Opens the file chooser with the keyboard and picks one in-memory file. */
async function pickFile(page: Page, button: Locator, name: string, mimeType: string) {
  await tabTo(page, button);
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  await (await chooser).setFiles({ name, mimeType, buffer: Buffer.from('fake file content') });
}

/**
 * Keys that type `iso` into a native date input. The field order follows the OS/browser locale
 * (not the context locale), so it is probed once on a scratch input outside the app.
 */
async function dateTyper(page: Page): Promise<(iso: string) => string> {
  await page.evaluate(() => {
    const probe = document.createElement('input');
    probe.type = 'date';
    probe.id = 'date-order-probe';
    document.body.append(probe);
    probe.focus();
  });
  await page.keyboard.type('01022000');
  const order = await page.evaluate(() => {
    const probe = document.getElementById('date-order-probe') as HTMLInputElement;
    probe.remove();
    return probe.value;
  });
  return (iso) => {
    const [y, m, d] = iso.split('-') as [string, string, string];
    if (order === '2000-02-01') return `${d}${m}${y}`;
    if (order === '2000-01-02') return `${m}${d}${y}`;
    throw new Error(`unknown date field order (probe gave "${order}")`);
  };
}

test.describe('flows', () => {
  test('cotação flow end to end: opens from the bubble, submits once and shows the summary', async ({
    page,
  }) => {
    await say(page, 'cotacao flow');
    const opener = page.getByRole('button', { name: 'Abrir cotação' });
    await opener.click();
    const sheet = page.getByRole('dialog', { name: 'Cotação' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('radio', { name: 'Auto' }).check();
    await sheet.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByRole('dialog', { name: 'Seus dados' })).toBeVisible();
    const dados = page.getByRole('dialog', { name: 'Seus dados' });
    await dados.getByLabel('Nome completo').fill('Maria Silva');
    await dados.getByLabel('CPF').fill('12345678909');
    await dados.getByLabel('Data de nascimento').fill('1990-05-20');
    await dados.getByLabel('Marca').fill('Fiat');
    await dados.getByLabel('Modelo').fill('Argo');
    await dados.getByLabel('Ano do veículo').fill('2020');
    await dados.getByLabel('CEP').fill('01310100');
    await dados.getByRole('button', { name: 'Calcular cotação' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(async () => (await flowEvents(page)).length).toBe(1);
    expect(await flowEvents(page)).toEqual([
      {
        type: 'user.flow_submit',
        payload: {
          flowId: 'cotacao',
          data: {
            produto: 'AUTO',
            nome: 'Maria Silva',
            cpf: '12345678909',
            nascimento: '1990-05-20',
            marca: 'Fiat',
            modelo: 'Argo',
            ano: '2020',
            cep: '01310100',
          },
        },
      },
    ]);
    const summary = page.getByText('Nome completo: Maria Silva', { exact: false });
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('Produto: Auto');
    await expect(summary).toContainText('Ano do veículo: 2020');
    await expect(page.getByText('Recebemos o seu formulário.')).toBeVisible();
    await expect(opener).toBeFocused();

    // the summary survives a reload, once, and nothing is submitted again
    await expect
      .poll(() => page.evaluate(() => JSON.stringify({ ...sessionStorage })))
      .toContain('Recebemos o seu formulário.');
    await page.reload();
    await expect(page.getByText('online')).toBeVisible();
    await expect(page.getByText('Nome completo: Maria Silva', { exact: false })).toHaveCount(1);
    expect(await flowEvents(page)).toHaveLength(1);
  });

  test('demo flow: every component, keyboard only, with data_exchange and complete', async ({
    page,
    context,
  }) => {
    const opened: string[] = [];
    await context.route('https://exemplo.invalid/**', (route) => {
      opened.push(route.request().url());
      return route.fulfill({ contentType: 'text/html', body: '<title>externo</title>' });
    });

    const date = await dateTyper(page);
    await say(page, 'demo flow');
    const opener = page.getByRole('button', { name: 'Abrir demonstração' });
    await opener.focus();
    await page.keyboard.press('Enter');

    // ---- INICIO: text, images, carousel, link, navigation list
    const inicio = page.getByRole('dialog', { name: 'Demonstração' });
    await expect(inicio.getByRole('heading', { name: 'Demonstração', exact: true })).toBeFocused();
    await expect(inicio.getByRole('heading', { name: 'Todos os componentes' })).toBeVisible();
    await expect(inicio.getByRole('heading', { name: 'Um Flow de demonstração' })).toBeVisible();
    await expect(inicio.locator('strong', { hasText: 'todos' })).toBeVisible();
    await expect(inicio.getByText('Dados fictícios, apenas para teste.')).toBeVisible();
    await expect(inicio.getByRole('heading', { name: 'Como funciona' })).toBeVisible();
    await expect(
      inicio.getByRole('listitem').filter({ hasText: 'Confirme o envio' }),
    ).toBeVisible();
    await expect(inicio.getByRole('img', { name: 'Logo da seguradora' })).toBeVisible();

    const carousel = inicio.getByRole('group', { name: 'Carrossel de imagens' });
    await tabTo(page, carousel);
    await expect(carousel.getByRole('img', { name: 'Carro protegido' })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(carousel.getByRole('img', { name: 'Casa protegida' })).toBeVisible();
    await expect(carousel.getByText('2 de 2')).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(carousel.getByText('1 de 2')).toBeVisible();

    await tabTo(page, inicio.getByRole('button', { name: 'Conheça a seguradora' }));
    const popup = context.waitForEvent('page');
    await page.keyboard.press('Enter');
    await (await popup).close();
    expect(opened).toEqual(['https://exemplo.invalid/sobre']);

    await tabTo(page, inicio.getByRole('button', { name: /Começar pelo cadastro/ }));
    await page.keyboard.press('Enter');

    // ---- DADOS: text inputs, dates, calendar (single and range), photo picker
    const dados = page.getByRole('dialog', { name: 'Seus dados' });
    await expect(dados.getByRole('heading', { name: 'Seus dados', exact: true })).toBeFocused();
    await tabTo(page, dados.getByLabel('Nome completo'));
    await page.keyboard.type('Maria Silva');
    await tabTo(page, dados.getByLabel('Observações'));
    await page.keyboard.type('Primeira linha');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Segunda linha');

    const nascimento = dados.getByLabel('Data de nascimento');
    await tabTo(page, nascimento);
    await page.keyboard.type(date('1990-05-20'));
    await expect(nascimento).toHaveValue('1990-05-20');
    // Escape on a focused native date input (picker closed) is the sheet's Escape: the form is
    // dirty, so it asks; "Continuar editando" returns the focus to the date input.
    await page.keyboard.press('Escape');
    const confirm = page.getByRole('alertdialog', { name: 'Descartar o formulário?' });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByRole('button', { name: 'Continuar editando' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(confirm).toHaveCount(0);
    await expect(nascimento).toBeFocused();
    await expect(nascimento).toHaveValue('1990-05-20');
    // With the native picker open (Space), the first Escape only closes the picker; the second
    // reaches the sheet. Were the first one the sheet's, the second would dismiss the confirm.
    await page.keyboard.press('Space');
    await page.keyboard.press('Escape');
    await expect(nascimento).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(confirm).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(confirm).toHaveCount(0);
    await expect(nascimento).toBeFocused();
    await expect(nascimento).toHaveValue('1990-05-20');

    const inicioVigencia = dados.getByLabel('Início da vigência');
    await tabTo(page, inicioVigencia);
    await page.keyboard.type(date('2027-01-15'));
    await expect(inicioVigencia).toHaveValue('2027-01-15');
    await tabTo(page, dados.getByLabel('Data inicial'));
    await page.keyboard.type(date('2027-02-01'));
    await tabTo(page, dados.getByLabel('Data final'));
    await page.keyboard.type(date('2027-02-10'));
    await expect(dados.getByLabel('Data final')).toHaveValue('2027-02-10');

    await pickFile(
      page,
      dados.getByRole('button', { name: 'Fotos do veículo' }),
      'carro.png',
      'image/png',
    );
    await expect(dados.getByText('carro.png', { exact: true })).toBeVisible();
    await expect(dados.getByRole('status')).toHaveText('carro.png adicionado');

    await tabTo(page, dados.getByRole('button', { name: 'Continuar' }));
    await page.keyboard.press('Enter');

    // ---- PREFERENCIAS: checkbox, radio + Switch, dropdown, chips + update_data
    const prefs = page.getByRole('dialog', { name: 'Preferências' });
    await expect(prefs.getByText('Olá, Maria Silva.')).toBeVisible();
    await tabTo(page, prefs.getByRole('checkbox', { name: 'Colisão' }));
    await page.keyboard.press('Space');
    await tabTo(page, prefs.getByRole('checkbox', { name: 'Roubo e furto' }));
    await page.keyboard.press('Space');
    await expect(prefs.getByRole('checkbox', { name: 'Colisão' })).toBeChecked();
    await expect(prefs.getByRole('checkbox', { name: 'Roubo e furto' })).toBeChecked();

    await tabTo(page, prefs.getByRole('radio', { name: 'Básico' }));
    await page.keyboard.press('Space');
    await expect(prefs.getByText('Plano básico: franquia maior.')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(prefs.getByRole('radio', { name: 'Completo' })).toBeChecked();
    await expect(prefs.getByText('Plano completo: franquia reduzida.')).toBeVisible();
    await expect(prefs.getByText('Plano básico: franquia maior.')).toHaveCount(0);

    const pagamento = prefs.getByLabel('Forma de pagamento');
    await tabTo(page, pagamento);
    // type-ahead on the closed select picks the first option starting with the letter
    await page.keyboard.press('p');
    await expect(pagamento).toHaveValue('PIX');

    const extras = prefs.getByText(/^Extras: /);
    await expect(extras).toHaveText('Extras: Nenhum extra');
    const guincho = prefs.getByRole('button', { name: 'Guincho' });
    await tabTo(page, guincho);
    await page.keyboard.press('Enter');
    await expect(guincho).toHaveAttribute('aria-pressed', 'true');
    await expect(extras).toHaveText('Extras: Com extras');
    await page.keyboard.press('Enter');
    await expect(guincho).toHaveAttribute('aria-pressed', 'false');
    await expect(extras).toHaveText('Extras: Nenhum extra');
    await page.keyboard.press('Space');
    await tabTo(page, prefs.getByRole('button', { name: 'Vidros' }));
    await page.keyboard.press('Space');
    await expect(extras).toHaveText('Extras: Com extras');

    await tabTo(page, prefs.getByRole('button', { name: 'Consultar' }));
    await page.keyboard.press('Enter');

    // ---- CONFIRMACAO: document picker, opt-in, If with a Footer on both branches
    const fim = page.getByRole('dialog', { name: 'Confirmação' });
    await expect(fim.getByRole('heading', { name: 'Confirmação', exact: true })).toBeFocused();
    await expect
      .poll(async () =>
        (await flowEvents(page)).filter((e) => e.type === 'user.flow_data_exchange'),
      )
      .toEqual([
        {
          type: 'user.flow_data_exchange',
          payload: {
            flowId: 'demo',
            screen: 'PREFERENCIAS',
            action: 'data_exchange',
            data: { coberturas: ['COLISAO', 'ROUBO'], plano: 'COMPLETO', pagamento: 'PIX' },
          },
        },
      ]);

    await expect(fim.getByText('Aceite os termos para enviar.')).toBeVisible();
    // pressing the else-branch Footer with the opt-in unchecked reveals the error and focuses it
    await tabTo(page, page.getByRole('button', { name: 'Aceite para enviar' }));
    await page.keyboard.press('Enter');
    const aceite = fim.getByRole('checkbox', { name: 'Li e aceito os termos' });
    await expect(aceite).toBeFocused();
    await expect(fim.getByText('Campo obrigatório')).toBeVisible();

    await tabTo(page, fim.getByRole('button', { name: 'Ler os termos' }));
    const terms = context.waitForEvent('page');
    await page.keyboard.press('Enter');
    await (await terms).close();
    expect(opened).toEqual(['https://exemplo.invalid/sobre', 'https://exemplo.invalid/termos']);

    await pickFile(
      page,
      fim.getByRole('button', { name: 'Comprovante de residência' }),
      'comprovante.pdf',
      'application/pdf',
    );
    await expect(fim.getByText('comprovante.pdf', { exact: true })).toBeVisible();

    await tabTo(page, aceite);
    await page.keyboard.press('Space');
    await expect(fim.getByText('Tudo pronto para enviar.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aceite para enviar' })).toHaveCount(0);
    await tabTo(page, page.getByRole('button', { name: 'Enviar' }));
    await page.keyboard.press('Enter');

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect
      .poll(
        async () => (await flowEvents(page)).filter((e) => e.type === 'user.flow_submit').length,
      )
      .toBe(1);
    const submit = (await flowEvents(page)).find((e) => e.type === 'user.flow_submit');
    expect(submit?.payload).toEqual({
      flowId: 'demo',
      data: {
        nome: 'Maria Silva',
        observacoes: 'Primeira linha\nSegunda linha',
        nascimento: '1990-05-20',
        inicio: '2027-01-15',
        periodo: { 'start-date': '2027-02-01', 'end-date': '2027-02-10' },
        fotos: [{ media_id: expect.stringMatching(/^local-/), file_name: 'carro.png' }],
        coberturas: ['COLISAO', 'ROUBO'],
        plano: 'COMPLETO',
        pagamento: 'PIX',
        extras: ['GUINCHO', 'VIDROS'],
        comprovante: [{ media_id: expect.stringMatching(/^local-/), file_name: 'comprovante.pdf' }],
        aceite: true,
      },
    });
    expect(await flowEvents(page)).toHaveLength(2);
    const summary = page.getByText('Nome completo: Maria Silva', { exact: false });
    await expect(summary).toContainText('Fotos do veículo: carro.png');
    await expect(summary).toContainText('Plano: Completo');
    await expect(summary).toContainText('Li e aceito os termos: Sim');
    // one line per value, every submitted value included
    expect(await summary.evaluate((el) => (el as HTMLElement).innerText.split('\n'))).toEqual([
      'Nome completo: Maria Silva',
      'Observações: Primeira linha Segunda linha',
      'Data de nascimento: 1990-05-20',
      'Início da vigência: 2027-01-15',
      'Período da viagem: 2027-02-01 a 2027-02-10',
      'Fotos do veículo: carro.png',
      'Coberturas: Colisão, Roubo e furto',
      'Plano: Completo',
      'Forma de pagamento: Pix',
      'Extras: Guincho, Vidros',
      'Comprovante de residência: comprovante.pdf',
      'Li e aceito os termos: Sim',
    ]);
    await expect(opener).toBeFocused();
  });

  test('Back keeps values; Close asks before discarding input; focus returns to the opener', async ({
    page,
  }) => {
    await say(page, 'demo flow');
    const opener = page.getByRole('button', { name: 'Abrir demonstração' });

    // untouched: Close and Escape close at once
    await opener.click();
    await page.getByRole('button', { name: 'Fechar' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(opener).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Demonstração' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(opener).toBeFocused();

    await opener.click();
    await page.getByRole('button', { name: /Começar pelo cadastro/ }).click();
    const nome = page.getByLabel('Nome completo');
    await nome.fill('Maria');
    await page.getByLabel('Data de nascimento').fill('1990-05-20');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByRole('dialog', { name: 'Preferências' })).toBeVisible();
    await page.getByRole('checkbox', { name: 'Incêndio' }).check();
    await page.getByRole('button', { name: 'Voltar' }).click();
    await expect(page.getByRole('dialog', { name: 'Seus dados' })).toBeVisible();
    await expect(nome).toHaveValue('Maria');
    await expect(page.getByLabel('Data de nascimento')).toHaveValue('1990-05-20');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByRole('checkbox', { name: 'Incêndio' })).toBeChecked();
    await page.getByRole('button', { name: 'Voltar' }).click();
    await page.getByRole('button', { name: 'Voltar' }).click();
    await expect(page.getByRole('dialog', { name: 'Demonstração' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Voltar' })).toHaveCount(0);

    const close = page.getByRole('button', { name: 'Fechar' });
    await close.click();
    const confirm = page.getByRole('alertdialog', { name: 'Descartar o formulário?' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Continuar editando' }).click();
    await expect(confirm).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Demonstração' })).toBeVisible();
    await expect(close).toBeFocused();

    await close.click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Descartar' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(await flowEvents(page)).toEqual([]);

    // reopening starts over
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: /Começar pelo cadastro/ }).click();
    await expect(page.getByLabel('Nome completo')).toHaveValue('');
  });
});
