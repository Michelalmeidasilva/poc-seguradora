import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import cotacao from './fixtures/cotacao.flow.json';
import contracting from './fixtures/ADE-03.flow.json';
import address from './fixtures/CAD-02.flow.json';
import addressReview from './fixtures/CAD-03.flow.json';
import dependentForm from './fixtures/DEP-05.flow.json';
import consentFlow from './fixtures/ADE-07.flow.json';
import products from './fixtures/DES-01.flow.json';
import { FlowSheet, type FlowSheetRequest } from './index';

const request: FlowSheetRequest = { flowId: 'cotacao', flowJson: cotacao, header: 'Cotação' };

function setup(overrides: Partial<FlowSheetRequest> = {}) {
  const onClose = vi.fn();
  const submit = vi.fn();
  const exchange = vi.fn();
  const utils = render(
    <FlowSheet
      request={{ ...request, ...overrides }}
      onClose={onClose}
      submit={submit}
      exchange={exchange}
    />,
  );
  return { ...utils, onClose, submit, exchange, user: userEvent.setup() };
}

const dialog = () => screen.getByRole('dialog');

async function toDados(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('radio', { name: /Auto/ }));
  await user.click(screen.getByRole('button', { name: 'Continuar' }));
}

afterEach(() => vi.restoreAllMocks());

describe('FlowSheet', () => {
  it('keeps holder, payment, review and explicit consent in one dialog and submits once', async () => {
    const { user, submit, exchange, onClose } = setup({ flowId: 'ADE-03', flowJson: contracting });
    const original = dialog();
    await user.type(screen.getByLabelText('Nome completo'), 'Beatriz Costa');
    await user.type(screen.getByLabelText('E-mail para documentos'), 'beatriz@example.com');
    await user.selectOptions(screen.getByLabelText('Forma de pagamento'), 'Outro meio disponível');
    await user.click(screen.getByRole('button', { name: 'Revisar contratação' }));
    expect(dialog()).toBe(original);
    expect(screen.getByText('Nome completo: Beatriz Costa')).toBeInTheDocument();
    expect(screen.getByText('Forma de pagamento: Outro meio disponível')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(submit).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirmar contratação' }));
    expect(submit).not.toHaveBeenCalled();
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByLabelText('Nome completo')).toHaveValue('Beatriz Costa');
    expect(screen.getByLabelText('Forma de pagamento')).toHaveValue('Outro meio disponível');
    await user.selectOptions(
      screen.getByLabelText('Forma de pagamento'),
      'Cartão cadastrado •• 2048',
    );
    await user.click(screen.getByRole('button', { name: 'Revisar contratação' }));
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Confirmar contratação' }));
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith(
      'ADE-03',
      {
        holder: 'Beatriz Costa',
        email: 'beatriz@example.com',
        payment: 'Cartão cadastrado •• 2048',
        consent: true,
      },
      expect.any(String),
    );
    expect(exchange).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each(['Individual', 'Familiar'])(
    'connects service details and %s selection to contracting in just one more screen',
    async (plan) => {
      const { user, submit, exchange, onClose } = setup({ flowId: 'DES-01', flowJson: products });
      const original = dialog();
      for (const [service, detail] of [
        ['Assistência Funeral', /suporte ao titular e aos dependentes/i],
        ['Assistência Farmácia', /descontos em redes credenciadas/i],
        ['Telemedicina', /ambiente do prestador/i],
      ] as const) {
        await user.click(screen.getByRole('radio', { name: new RegExp(service) }));
        await user.click(screen.getByRole('button', { name: 'Ver detalhes' }));
        expect(dialog()).toBe(original);
        expect(within(dialog()).getByText(detail)).toBeInTheDocument();
        expect(screen.getByText('R$ 29,90/mês')).toBeInTheDocument();
        expect(screen.getByText('R$ 39,90/mês')).toBeInTheDocument();
        expect(screen.queryByLabelText('CPF')).not.toBeInTheDocument();
        expect(submit).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: 'Voltar' }));
      }
      await user.click(screen.getByRole('button', { name: 'Ver detalhes' }));
      await user.click(screen.getByRole('button', { name: 'Escolher plano' }));
      expect(screen.getByText('Telemedicina', { exact: true })).toBeInTheDocument();
      await user.click(screen.getByRole('radio', { name: new RegExp(`^${plan}`) }));
      await user.click(screen.getByRole('button', { name: 'Continuar contratação' }));
      expect(submit).not.toHaveBeenCalled();
      await user.type(screen.getByLabelText('CPF'), '12345678900');
      await user.click(screen.getByRole('button', { name: 'Voltar' }));
      await user.click(screen.getByRole('button', { name: 'Escolher plano' }));
      expect(screen.getByRole('radio', { name: new RegExp(`^${plan}`) })).toBeChecked();
      await user.click(screen.getByRole('button', { name: 'Continuar contratação' }));
      expect(submit).toHaveBeenCalledTimes(1);
      expect(submit).toHaveBeenCalledWith(
        'DES-01',
        { intent: 'contract', service: '2', modality: plan.toLowerCase(), cpf: '12345678900' },
        expect.any(String),
      );
      expect(exchange).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1);
    },
  );
  it('keeps an invalid CPF in the final screen without sending it to chat', async () => {
    const { user, submit } = setup({ flowId: 'DES-01', flowJson: products });
    await user.click(screen.getByRole('radio', { name: /Telemedicina/ }));
    await user.click(screen.getByRole('button', { name: 'Ver detalhes' }));
    await user.click(screen.getByRole('button', { name: 'Escolher plano' }));
    await user.click(screen.getByRole('radio', { name: /^Individual/ }));
    expect(screen.getByLabelText('CPF')).toHaveAttribute('inputmode', 'numeric');
    await user.type(screen.getByLabelText('CPF'), 'abcdefghijk');
    await user.click(screen.getByRole('button', { name: 'Continuar contratação' }));
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText('Informe um CPF com 11 dígitos.')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('CPF'));
    await user.type(screen.getByLabelText('CPF'), '123.456.789-00');
    await user.click(screen.getByRole('button', { name: 'Continuar contratação' }));
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it('explains the list interaction and identifies the structured demonstration like the atlas', () => {
    setup({ flowId: 'DES-01', flowJson: products });
    expect(screen.getByText('Selecione uma opção para continuar')).toBeInTheDocument();
    expect(screen.getByText('DIGIO Care')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });
  it('shows safe cross-step review values and prefills correction without losing other fields', async () => {
    const draft = { postal: '01000-000', address: 'Rua A, 1', city: 'São Paulo/SP' };
    const { user, submit, rerender } = setup({
      flowId: 'CAD-03',
      flowJson: addressReview,
      initialData: { intent: 'review', values: draft },
    });
    expect(screen.getByText('CEP').closest('.flow-review-line')).toHaveTextContent('01000-000');
    expect(screen.getByText('Endereço').closest('.flow-review-line')).toHaveTextContent('Rua A, 1');
    expect(screen.getByText('Cidade e estado').closest('.flow-review-line')).toHaveTextContent(
      'São Paulo/SP',
    );
    await user.click(screen.getByRole('button', { name: 'Enviar solicitação' }));
    expect(submit).toHaveBeenCalledTimes(1);

    rerender(
      <FlowSheet
        request={{
          flowId: 'CAD-02',
          flowJson: address,
          initialData: { intent: 'correction', values: draft },
        }}
        onClose={() => undefined}
        submit={submit}
        exchange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('CEP')).toHaveValue('01000-000');
    expect(screen.getByLabelText('Endereço e número')).toHaveValue('Rua A, 1');
    expect(screen.getByLabelText('Cidade e estado')).toHaveValue('São Paulo/SP');
    await user.clear(screen.getByLabelText('Endereço e número'));
    await user.type(screen.getByLabelText('Endereço e número'), 'Rua B, 2');
    expect(screen.getByLabelText('CEP')).toHaveValue('01000-000');
    expect(screen.getByLabelText('Cidade e estado')).toHaveValue('São Paulo/SP');
  });
  it('keeps correction CPF only in runtime memory and renders the masked review value', async () => {
    const rawCpf = '98765432109';
    expect(JSON.stringify(dependentForm)).not.toContain(rawCpf);
    const { user } = setup({
      flowId: 'DEP-05',
      flowJson: dependentForm,
      initialData: {
        intent: 'correction',
        values: {
          name: 'Maria Silva',
          birth: '2014-03-12',
          document: rawCpf,
          relationship: 'Filha',
          phone: '11999999999',
          biologicalSex: 'Feminino',
        },
      },
    });
    expect(screen.getByLabelText('CPF')).toHaveValue(rawCpf);
    await user.clear(screen.getByLabelText('CPF'));
    await user.type(screen.getByLabelText('CPF'), '12345678900');
    await user.click(screen.getByRole('button', { name: 'Revisar inclusão' }));
    expect(screen.getByText('CPF: ••••')).toBeInTheDocument();
    expect(screen.queryByText(/CPF: (98765432109|12345678900)/)).toBeNull();
  });
  it('starts catalog consent unchecked and closing before confirmation does not submit', async () => {
    const { user, submit, exchange } = setup({ flowId: 'ADE-07', flowJson: consentFlow });
    expect(screen.getByRole('checkbox', { name: /Confirmo os dados/ })).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Confirmar contratação' }));
    expect(submit).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(submit).not.toHaveBeenCalled();
    expect(exchange).not.toHaveBeenCalled();
  });
  it('reviews a catalog form, preserves other values on correction, and submits once', async () => {
    const { user, submit, exchange } = setup({ flowId: 'CAD-02', flowJson: address });
    await user.type(screen.getByLabelText('CEP'), '01000-000');
    await user.type(screen.getByLabelText('Endereço e número'), 'Rua A, 1');
    await user.type(screen.getByLabelText('Cidade e estado'), 'São Paulo/SP');
    await user.click(screen.getByRole('button', { name: 'Revisar pedido' }));
    expect(screen.getByText(/Rua A, 1/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    await user.clear(screen.getByLabelText('Endereço e número'));
    await user.type(screen.getByLabelText('Endereço e número'), 'Rua B, 2');
    expect(screen.getByLabelText('CEP')).toHaveValue('01000-000');
    expect(screen.getByLabelText('Cidade e estado')).toHaveValue('São Paulo/SP');
    await user.click(screen.getByRole('button', { name: 'Revisar pedido' }));
    await user.click(screen.getByRole('button', { name: 'Enviar formulário' }));
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith(
      'CAD-02',
      { postal: '01000-000', address: 'Rua B, 2', city: 'São Paulo/SP' },
      expect.any(String),
    );
    expect(exchange).not.toHaveBeenCalled();
  });
  it('is a modal dialog labelled by the current screen title, focused on its heading', () => {
    setup();
    const d = dialog();
    expect(d).toHaveAttribute('aria-modal', 'true');
    expect(d).toHaveAccessibleName('Cotação');
    expect(screen.getByRole('heading', { name: 'Cotação' })).toHaveFocus();
    // entry screen: no Back
    expect(screen.queryByRole('button', { name: 'Voltar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeInTheDocument();
  });

  it('renders the Footer in the fixed slot, outside the scrollable body', () => {
    const { container } = setup();
    const button = screen.getByRole('button', { name: 'Continuar' });
    const slot = container.ownerDocument.querySelector('.flow-sheet__footer');
    const body = container.ownerDocument.querySelector('.flow-sheet__body');
    expect(slot).toContainElement(button);
    expect(body).not.toContainElement(button);
  });

  it('walks the cotação flow to exactly one submit and closes', async () => {
    const { user, submit, onClose, exchange } = setup();
    await toDados(user);
    expect(dialog()).toHaveAccessibleName('Seus dados');
    expect(screen.getByRole('heading', { name: 'Seus dados' })).toHaveFocus();
    await user.type(screen.getByLabelText('Nome completo'), 'Ana Lima');
    await user.type(screen.getByLabelText('CPF'), '12345678909');
    await user.type(screen.getByLabelText('Data de nascimento'), '1990-05-20');
    await user.type(screen.getByLabelText('Marca'), 'Fiat');
    await user.type(screen.getByLabelText('Modelo'), 'Uno');
    await user.type(screen.getByLabelText('Ano do veículo'), '2020');
    await user.type(screen.getByLabelText('CEP'), '01001000');
    await user.click(screen.getByRole('button', { name: 'Calcular cotação' }));

    expect(submit).toHaveBeenCalledTimes(1);
    const [flowId, data, summary] = submit.mock.calls[0]!;
    expect(flowId).toBe('cotacao');
    expect(data).toEqual({
      produto: 'AUTO',
      nome: 'Ana Lima',
      cpf: '12345678909',
      nascimento: '1990-05-20',
      marca: 'Fiat',
      modelo: 'Uno',
      ano: '2020',
      cep: '01001000',
    });
    expect(typeof summary).toBe('string');
    expect(exchange).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Back returns to the previous screen and keeps the values', async () => {
    const { user } = setup();
    await toDados(user);
    await user.type(screen.getByLabelText('Nome completo'), 'Ana');
    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(dialog()).toHaveAccessibleName('Cotação');
    expect(screen.getByRole('heading', { name: 'Cotação' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: /Auto/ })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByLabelText('Nome completo')).toHaveValue('Ana');
  });

  it('shows an error state for an invalid Flow and warns with paths/codes only', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { user, onClose } = setup({ flowJson: { version: '7.0', screens: 'SEGREDO' } });
    expect(screen.getByText('Não foi possível abrir este formulário.')).toBeInTheDocument();
    expect(dialog()).toHaveAttribute('aria-modal', 'true');
    expect(warn).toHaveBeenCalled();
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('screens_required');
    expect(logged).not.toContain('SEGREDO');
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('rejects a Flow that references a form field no screen declares', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const flowJson = {
      version: '7.1',
      screens: [
        {
          id: 'A',
          terminal: true,
          layout: {
            type: 'SingleColumnLayout',
            children: [
              { type: 'TextInput', name: 'nome', label: 'Nome' },
              {
                type: 'Footer',
                label: 'Enviar',
                'on-click-action': { name: 'complete', payload: { x: '${form.fantasma}' } },
              },
            ],
          },
        },
      ],
    };
    setup({ flowJson });
    expect(screen.getByText('Não foi possível abrir este formulário.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nome')).toBeNull();
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('fantasma');
    expect(logged).toContain('unknown_form_ref');
  });

  it('opens a Flow whose form refs cross screens but are all declared', async () => {
    const screenOf = (id: string, children: unknown[], extra = {}) => ({
      id,
      layout: { type: 'SingleColumnLayout', children },
      ...extra,
    });
    const flowJson = {
      version: '7.1',
      screens: [
        screenOf('A', [
          { type: 'TextInput', name: 'nome', label: 'Nome' },
          {
            type: 'Footer',
            label: 'Seguir',
            'on-click-action': { name: 'navigate', next: { type: 'screen', name: 'B' } },
          },
        ]),
        screenOf(
          'B',
          [
            { type: 'TextBody', text: 'Olá ${form.nome}' },
            {
              type: 'Footer',
              label: 'Enviar',
              'on-click-action': { name: 'complete', payload: { nome: '${form.nome}' } },
            },
          ],
          { terminal: true },
        ),
      ],
    };
    const { user, submit } = setup({ flowJson, flowId: 'x' });
    await user.type(screen.getByLabelText('Nome'), 'Ana');
    await user.click(screen.getByRole('button', { name: 'Seguir' }));
    expect(screen.getByText('Olá Ana')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(submit).toHaveBeenCalledWith('x', { nome: 'Ana' }, expect.any(String));
  });

  it('traps Tab and Shift+Tab inside the sheet, including the footer', async () => {
    const outside = document.createElement('button');
    outside.textContent = 'fora';
    document.body.append(outside);
    const { user } = setup();
    const close = screen.getByRole('button', { name: 'Fechar' });
    const footer = screen.getByRole('button', { name: 'Continuar' });
    close.focus();
    await user.tab({ shift: true });
    expect(footer).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    for (let i = 0; i < 8; i++) {
      await user.tab();
      expect(dialog()).toContainElement(document.activeElement as HTMLElement);
    }
    outside.remove();
  });

  it('Escape with no input closes at once', async () => {
    const { user, onClose } = setup();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('Escape with input asks to discard; continue editing keeps the form', async () => {
    const { user, onClose } = setup();
    await user.click(screen.getByRole('radio', { name: /Auto/ }));
    await user.keyboard('{Escape}');
    const confirm = screen.getByRole('alertdialog', { name: 'Descartar o formulário?' });
    expect(within(confirm).getByRole('button', { name: 'Continuar editando' })).toHaveFocus();
    // Escape inside the confirm = continue editing
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: /Auto/ })).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    await user.click(screen.getByRole('button', { name: 'Continuar editando' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Close with input asks to discard; Descartar closes without submitting', async () => {
    const { user, onClose, submit } = setup();
    await user.click(screen.getByRole('radio', { name: /Auto/ }));
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    const confirm = screen.getByRole('alertdialog');
    // the confirm traps the focus too
    await user.tab();
    expect(confirm).toContainElement(document.activeElement as HTMLElement);
    await user.tab();
    expect(confirm).toContainElement(document.activeElement as HTMLElement);
    await user.click(within(confirm).getByRole('button', { name: 'Descartar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
  });

  describe('with init-value defaults', () => {
    const seededFlow = {
      version: '7.0',
      screens: [
        {
          id: 'A',
          title: 'Contato',
          terminal: true,
          layout: {
            type: 'SingleColumnLayout',
            children: [
              { type: 'TextInput', name: 'nome', label: 'Nome', 'init-value': 'Ana' },
              { type: 'Footer', label: 'Ok', 'on-click-action': { name: 'complete', payload: {} } },
            ],
          },
        },
      ],
    };

    it('closes at once when untouched (Close and Escape)', async () => {
      const a = setup({ flowJson: seededFlow });
      expect(screen.getByLabelText('Nome')).toHaveValue('Ana');
      await a.user.click(screen.getByRole('button', { name: 'Fechar' }));
      expect(a.onClose).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('alertdialog')).toBeNull();
      a.unmount();
      const b = setup({ flowJson: seededFlow });
      await b.user.keyboard('{Escape}');
      expect(b.onClose).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('asks once the user edited a field, even back to the default value', async () => {
      const { user, onClose } = setup({ flowJson: seededFlow });
      const input = screen.getByLabelText('Nome');
      // focus, type, then restore the default: still an edit
      await user.type(input, 'x');
      await user.type(input, '{Backspace}');
      expect(input).toHaveValue('Ana');
      await user.keyboard('{Escape}');
      expect(
        screen.getByRole('alertdialog', { name: 'Descartar o formulário?' }),
      ).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  it('returns the focus to the opener on close', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const { unmount } = setup();
    expect(opener).not.toHaveFocus();
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it('opens URLs in a new tab without opener', () => {
    // covered through the host contract: openUrl -> window.open(_blank, noopener)
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const flow = {
      version: '7.0',
      screens: [
        {
          id: 'A',
          terminal: true,
          layout: {
            type: 'SingleColumnLayout',
            children: [
              {
                type: 'Footer',
                label: 'Abrir',
                'on-click-action': { name: 'open_url', url: 'https://example.com/x' },
              },
            ],
          },
        },
      ],
    };
    setup({ flowJson: flow });
    act(() => screen.getByRole('button', { name: 'Abrir' }).click());
    expect(open).toHaveBeenCalledWith('https://example.com/x', '_blank', 'noopener,noreferrer');
  });

  it('falls back to the request header, then "Formulário", for the dialog name', () => {
    const flow = {
      version: '7.0',
      screens: [
        {
          id: 'A',
          terminal: true,
          layout: {
            type: 'SingleColumnLayout',
            children: [
              { type: 'TextBody', text: 'oi' },
              { type: 'Footer', label: 'Ok', 'on-click-action': { name: 'complete', payload: {} } },
            ],
          },
        },
      ],
    };
    const a = setup({ flowJson: flow, header: 'Ajuda' });
    expect(dialog()).toHaveAccessibleName('Ajuda');
    expect(screen.getByText('oi')).toBeInTheDocument();
    a.unmount();
    setup({ flowJson: flow, header: undefined });
    expect(dialog()).toHaveAccessibleName('Formulário');
  });

  it('marks reduced motion with a class when the user prefers it', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query.includes('prefers-reduced-motion'),
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    );
    setup();
    expect(document.querySelector('.flow-sheet')).toHaveClass('flow-sheet--reduced-motion');
  });

  it('animates by default (no reduced-motion class)', () => {
    setup();
    expect(document.querySelector('.flow-sheet')).not.toHaveClass('flow-sheet--reduced-motion');
  });
});
