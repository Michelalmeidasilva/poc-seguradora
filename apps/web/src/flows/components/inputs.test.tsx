import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useFlow } from '../FlowContext';
import { footerDisabled } from '../runtime';
import { flowOf, renderInFlow } from '../test-utils';
import { CheckboxGroup, Dropdown, OptIn, RadioButtonsGroup, TextArea, TextInput } from './inputs';

const opts = [
  { id: 'a', title: 'Alfa' },
  { id: 'b', title: 'Beta', description: 'segunda' },
  { id: 'c', title: 'Gama' },
];

function Probe() {
  const { state, flow } = useFlow();
  return (
    <>
      <output data-testid="form">{JSON.stringify(state.form)}</output>
      <output data-testid="footer">{String(footerDisabled(flow, state))}</output>
    </>
  );
}
const form = () => JSON.parse(screen.getByTestId('form').textContent ?? '{}');

/** Remounting children stands in for leaving the screen and coming Back. */
function Remount({ children }: { children: React.ReactNode }) {
  const [on, setOn] = useState(true);
  return (
    <>
      <button onClick={() => setOn((v) => !v)}>toggle</button>
      {on ? children : null}
    </>
  );
}

describe('TextInput', () => {
  const c = {
    type: 'TextInput',
    name: 'nome',
    label: 'Nome ${data.x}',
    'helper-text': 'Ajuda',
    required: true,
    'min-chars': 3,
  } as const;

  it('renders label and helper bound to the control; typing updates form', async () => {
    const user = userEvent.setup();
    renderInFlow(
      <>
        <TextInput c={c} />
        <Probe />
      </>,
      flowOf([c]),
      { data: { x: 'Z' } },
    );
    const input = screen.getByLabelText('Nome Z');
    expect(screen.getByText('Ajuda')).toBeInTheDocument();
    expect(input).toHaveAccessibleDescription('Ajuda');
    await user.type(input, 'Ana');
    expect(form()).toEqual({ nome: 'Ana' });
  });

  it('shows the error only after blur, with aria wiring', async () => {
    const user = userEvent.setup();
    renderInFlow(<TextInput c={c} />, flowOf([c]));
    const input = screen.getByLabelText('Nome');
    await user.type(input, 'A');
    expect(screen.queryByText('Mínimo de 3 caracteres')).toBeNull();
    expect(input).toHaveAttribute('aria-invalid', 'false');
    await user.tab();
    expect(screen.getByText('Mínimo de 3 caracteres')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Ajuda Mínimo de 3 caracteres');
  });

  it('maps input-type and disables when enabled is false', () => {
    const e = {
      type: 'TextInput',
      name: 'e',
      label: 'Mail',
      'input-type': 'email',
      enabled: false,
    } as const;
    renderInFlow(<TextInput c={e} />, flowOf([e]));
    const input = screen.getByLabelText('Mail');
    expect(input).toHaveAttribute('type', 'email');
    expect(input).toBeDisabled();
  });

  it('seeds init-value once, keeps user edits across remounts and StrictMode', async () => {
    const user = userEvent.setup();
    const i = { type: 'TextInput', name: 'n', label: 'N', 'init-value': 'Pre ${data.x}' } as const;
    renderInFlow(
      <StrictMode>
        <Remount>
          <TextInput c={i} />
        </Remount>
        <Probe />
      </StrictMode>,
      flowOf([i]),
      { data: { x: 'fix' } },
    );
    const input = screen.getByLabelText('N');
    expect(input).toHaveValue('Pre fix');
    await user.clear(input);
    await user.type(input, 'meu');
    await user.click(screen.getByText('toggle'));
    await user.click(screen.getByText('toggle'));
    expect(screen.getByLabelText('N')).toHaveValue('meu');
    expect(form()).toEqual({ n: 'meu' });
  });

  it('keeps a cleared value instead of re-seeding', async () => {
    const user = userEvent.setup();
    const i = { type: 'TextInput', name: 'n', label: 'N', 'init-value': 'x' } as const;
    renderInFlow(
      <Remount>
        <TextInput c={i} />
      </Remount>,
      flowOf([i]),
    );
    await user.clear(screen.getByLabelText('N'));
    await user.click(screen.getByText('toggle'));
    await user.click(screen.getByText('toggle'));
    expect(screen.getByLabelText('N')).toHaveValue('');
  });

  it('renders touched errors from the Footer touch-all and survives odd prop types', () => {
    const odd = {
      type: 'TextInput',
      name: 'o',
      label: 5,
      required: '${data.req}',
      'min-chars': {},
    } as never;
    renderInFlow(<TextInput c={odd} />, flowOf([odd]));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });
});

describe('TextArea', () => {
  it('renders a textarea with label and stores the value', async () => {
    const user = userEvent.setup();
    const c = { type: 'TextArea', name: 'obs', label: 'Obs', required: true } as const;
    renderInFlow(
      <>
        <TextArea c={c} />
        <Probe />
      </>,
      flowOf([c]),
    );
    const el = screen.getByLabelText('Obs');
    expect(el.tagName).toBe('TEXTAREA');
    await user.type(el, 'oi');
    expect(form()).toEqual({ obs: 'oi' });
    await user.clear(el);
    await user.tab();
    expect(screen.getByText('Campo obrigatório')).toBeInTheDocument();
  });
});

describe('CheckboxGroup', () => {
  const c = {
    type: 'CheckboxGroup',
    name: 'cb',
    label: 'Itens',
    'data-source': opts,
    'max-selected-items': 2,
    'min-selected-items': 1,
    required: true,
  } as const;

  it('stores ids, shows descriptions and caps the selection', async () => {
    const user = userEvent.setup();
    renderInFlow(
      <>
        <CheckboxGroup c={c} />
        <Probe />
      </>,
      flowOf([c]),
    );
    expect(screen.getByRole('group', { name: 'Itens' })).toBeInTheDocument();
    expect(screen.getByText('segunda')).toBeInTheDocument();
    await user.click(screen.getByLabelText(/Alfa/));
    await user.click(screen.getByLabelText(/Gama/));
    expect(form()).toEqual({ cb: ['a', 'c'] });
    expect(screen.getByLabelText(/Beta/)).toBeDisabled();
    await user.click(screen.getByLabelText(/Alfa/));
    expect(form()).toEqual({ cb: ['c'] });
    expect(screen.getByLabelText(/Beta/)).toBeEnabled();
  });

  it('shows the required error after the group loses focus', async () => {
    const user = userEvent.setup();
    renderInFlow(
      <>
        <button>fora</button>
        <CheckboxGroup c={c} />
      </>,
      flowOf([c]),
    );
    await user.click(screen.getByLabelText(/Alfa/));
    await user.click(screen.getByLabelText(/Alfa/));
    expect(screen.queryByText('Campo obrigatório')).toBeNull();
    await user.click(screen.getByText('fora'));
    expect(screen.getByText('Campo obrigatório')).toBeInTheDocument();
  });

  it('disables options with enabled false', () => {
    const d = { ...c, 'data-source': [{ id: 'x', title: 'Xis', enabled: false }] };
    renderInFlow(<CheckboxGroup c={d} />, flowOf([d]));
    expect(screen.getByLabelText(/Xis/)).toBeDisabled();
  });

  it('tolerates a malformed data-source', () => {
    const d = { type: 'CheckboxGroup', name: 'z', label: 'Z', 'data-source': 'nope' } as never;
    renderInFlow(<CheckboxGroup c={d} />, flowOf([d]));
    expect(screen.getByRole('group', { name: 'Z' })).toBeInTheDocument();
  });
});

describe('RadioButtonsGroup', () => {
  const c = {
    type: 'RadioButtonsGroup',
    name: 'r',
    label: 'Escolha',
    'data-source': opts,
    required: true,
  } as const;

  it('stores the option id, not the title', async () => {
    const user = userEvent.setup();
    renderInFlow(
      <>
        <RadioButtonsGroup c={c} />
        <Probe />
      </>,
      flowOf([c]),
    );
    await user.click(screen.getByRole('radio', { name: /Beta/ }));
    expect(form()).toEqual({ r: 'b' });
    expect(screen.getByRole('radio', { name: /Beta/ })).toBeChecked();
  });

  it('is disabled when enabled is false', () => {
    const d = { ...c, enabled: false };
    renderInFlow(<RadioButtonsGroup c={d} />, flowOf([d]));
    for (const r of screen.getAllByRole('radio')) expect(r).toBeDisabled();
  });
});

describe('Dropdown', () => {
  const c = {
    type: 'Dropdown',
    name: 'dd',
    label: 'Cidade',
    'data-source': opts,
    required: true,
  } as const;

  it('selects by id and submits the id', async () => {
    const user = userEvent.setup();
    renderInFlow(
      <>
        <Dropdown c={c} />
        <Probe />
      </>,
      flowOf([c]),
    );
    const select = screen.getByLabelText('Cidade');
    expect(select.tagName).toBe('SELECT');
    await user.selectOptions(select, 'Gama');
    expect(form()).toEqual({ dd: 'c' });
    expect(select).toHaveValue('c');
  });

  it('flags the required error after blur', async () => {
    const user = userEvent.setup();
    renderInFlow(<Dropdown c={c} />, flowOf([c]));
    const select = screen.getByLabelText('Cidade');
    await user.click(select);
    await user.tab();
    expect(screen.getByText('Campo obrigatório')).toBeInTheDocument();
    expect(select).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('OptIn', () => {
  const c = {
    type: 'OptIn',
    name: 'ok',
    label: 'Aceito os termos',
    required: true,
    'on-click-action': { name: 'open_url', url: 'https://example.com/t' },
  } as const;

  it('required and unchecked blocks the Footer; checking unblocks', async () => {
    const user = userEvent.setup();
    renderInFlow(
      <>
        <OptIn c={c} />
        <Probe />
      </>,
      flowOf([c]),
    );
    expect(screen.getByTestId('footer')).toHaveTextContent('true');
    await user.click(screen.getByRole('checkbox', { name: 'Aceito os termos' }));
    expect(form()).toEqual({ ok: true });
    expect(screen.getByTestId('footer')).toHaveTextContent('false');
  });

  it('runs the open_url action from the terms link', async () => {
    const user = userEvent.setup();
    const runAction = vi.fn();
    renderInFlow(<OptIn c={c} />, flowOf([c]), { runAction });
    await user.click(screen.getByRole('button', { name: 'Ler os termos' }));
    expect(runAction).toHaveBeenCalledWith(c['on-click-action']);
  });

  it('shows the required error after blur', async () => {
    const user = userEvent.setup();
    renderInFlow(<OptIn c={c} />, flowOf([c]));
    const box = screen.getByRole('checkbox');
    await user.click(box);
    await user.click(box);
    await user.tab();
    await user.tab();
    expect(screen.getByText('Campo obrigatório')).toBeInTheDocument();
  });
});

describe('option lists with repeated ids', () => {
  const dup = [
    { id: 'x', title: 'Primeiro' },
    { id: 'x', title: 'Segundo' },
  ];
  it.each([
    ['CheckboxGroup', CheckboxGroup],
    ['RadioButtonsGroup', RadioButtonsGroup],
    ['Dropdown', Dropdown],
  ] as const)('%s renders every option without a duplicate-key warning', (type, Component) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = { type, name: 'f', label: 'F', 'data-source': dup };
    renderInFlow(<Component c={c} />, flowOf([c]));
    expect(screen.getByText('Primeiro')).toBeInTheDocument();
    expect(screen.getByText('Segundo')).toBeInTheDocument();
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
