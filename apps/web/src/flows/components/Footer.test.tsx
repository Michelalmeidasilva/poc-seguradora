import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { flowOf, renderInFlow } from '../test-utils';
import { Layout } from './Layout';

const action = { name: 'complete', payload: {} };
const footer = (extra: Record<string, unknown> = {}) => ({
  type: 'Footer',
  label: 'Enviar',
  'on-click-action': action,
  ...extra,
});
const input = (name: string) => ({
  type: 'TextInput',
  name,
  label: name,
  'input-type': 'text',
  required: true,
});

describe('Footer', () => {
  it('runs its raw action once per click', async () => {
    const runAction = vi.fn();
    renderInFlow(<Layout />, flowOf([footer()]), { runAction });
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(runAction).toHaveBeenCalledTimes(1);
    expect(runAction).toHaveBeenCalledWith(action);
  });

  it('is disabled with enabled: false', () => {
    renderInFlow(<Layout />, flowOf([footer({ enabled: false })]));
    expect(screen.getByRole('button', { name: 'Enviar' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('with errors: touches fields, focuses the first invalid one, skips the action', async () => {
    const runAction = vi.fn();
    renderInFlow(<Layout />, flowOf([input('a'), input('b'), footer()]), { runAction });
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(runAction).not.toHaveBeenCalled();
    expect(screen.getAllByText('Campo obrigatório').length).toBe(2);
    expect(screen.getByLabelText('a')).toHaveFocus();
  });

  it('renders captions: left+right, or center alone', () => {
    const a = renderInFlow(
      <Layout />,
      flowOf([footer({ 'left-caption': 'L', 'right-caption': 'R' })]),
    );
    expect(screen.getByText('L')).toBeInTheDocument();
    expect(screen.getByText('R')).toBeInTheDocument();
    a.unmount();
    renderInFlow(
      <Layout />,
      flowOf([footer({ 'center-caption': 'C', 'left-caption': 'L', 'right-caption': 'R' })]),
    );
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.queryByText('L')).toBeNull();
    expect(screen.queryByText('R')).toBeNull();
  });

  it('portals into footerSlot when given', () => {
    const slot = document.createElement('div');
    document.body.append(slot);
    const { container } = renderInFlow(<Layout />, flowOf([footer()]), { footerSlot: slot });
    expect(slot.querySelector('button')).not.toBeNull();
    expect(container.querySelector('button')).toBeNull();
    slot.remove();
  });

  it('inside an If branch appears exactly once', () => {
    renderInFlow(
      <Layout />,
      flowOf([
        {
          type: 'If',
          condition: '${data.x}',
          then: [footer()],
          else: [footer({ label: 'Outro' })],
        },
      ]),
      { data: { x: true } },
    );
    expect(screen.getAllByRole('button', { name: 'Enviar' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Outro' })).toBeNull();
  });
});
