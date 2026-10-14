import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flowOf, renderInFlow } from '../test-utils';
import { Layout } from './Layout';
import { resetUnknownWarnings } from './registry';

afterEach(() => {
  vi.restoreAllMocks();
  resetUnknownWarnings();
});

describe('Layout', () => {
  it('presents review sections with distinct labels and values without splitting colons in values', () => {
    const { container } = renderInFlow(
      <Layout review />,
      flowOf([
        { type: 'TextBody', text: 'Confira antes de confirmar.' },
        { type: 'TextSubheading', text: 'Pessoa' },
        { type: 'TextBody', text: 'Nome: Ana Lima' },
        { type: 'TextBody', text: 'Nascimento: 2012-05-20' },
        { type: 'TextSubheading', text: 'Atendimento' },
        { type: 'TextBody', text: 'Horário: 10:30' },
        { type: 'TextCaption', text: 'Conteúdo demonstrativo.' },
      ]),
    );
    expect(container.querySelectorAll('.flow-review-section')).toHaveLength(2);
    expect(container.querySelector('.flow-review-line span')).toHaveTextContent('Nome');
    expect(container.querySelector('.flow-review-line strong')).toHaveTextContent('Ana Lima');
    expect(screen.getByText('10:30')).toBeInTheDocument();
    expect(screen.getByText('20/05/2012')).toBeInTheDocument();
    expect(screen.getByText('Confira antes de confirmar.')).toBeInTheDocument();
    expect(screen.getByText('Conteúdo demonstrativo.').closest('.flow-review-section')).toBeNull();
  });
  it('renders visible children and skips unknown types', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderInFlow(
      <Layout />,
      flowOf([
        { type: 'TextBody', text: 'Hello ${data.n}' },
        { type: 'Nope' },
        { type: 'TextBody', text: 'Hidden', visible: false },
      ]),
      { data: { n: 'Ana' } },
    );
    expect(screen.getByText('Hello Ana')).toBeInTheDocument();
    expect(screen.queryByText('Hidden')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('toggles with visible: "${data.show}"', () => {
    const flow = flowOf([{ type: 'TextBody', text: 'Shown', visible: '${data.show}' }]);
    const on = renderInFlow(<Layout />, flow, { data: { show: true } });
    expect(screen.getByText('Shown')).toBeInTheDocument();
    on.unmount();
    renderInFlow(<Layout />, flow, { data: { show: false } });
    expect(screen.queryByText('Shown')).toBeNull();
  });

  it('flattens If branches by form value', () => {
    const flow = flowOf([
      {
        type: 'If',
        condition: '${data.ok}',
        then: [{ type: 'TextBody', text: 'yes' }],
        else: [{ type: 'TextBody', text: 'no' }],
      },
    ]);
    renderInFlow(<Layout />, flow, { data: { ok: false } });
    expect(screen.getByText('no')).toBeInTheDocument();
  });

  it('keeps a field mounted (and focused) when a conditional above it toggles', async () => {
    const user = userEvent.setup();
    const flow = flowOf([
      {
        type: 'If',
        condition: "${form.nome} == 'M'",
        then: [{ type: 'TextCaption', text: 'Olá, M' }],
      },
      { type: 'TextInput', name: 'nome', label: 'Nome' },
    ]);
    renderInFlow(<Layout />, flow);
    const input = screen.getByLabelText('Nome');
    await user.click(input);
    await user.keyboard('M');
    expect(screen.getByText('Olá, M')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toBe(input);
    expect(input).toHaveFocus();
    await user.keyboard('a');
    expect(screen.getByLabelText('Nome')).toBe(input);
    expect(input).toHaveValue('Ma');
  });
});
