import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FlowMessage } from './FlowMessage';

const payload = {
  flowId: 'cotacao',
  body: 'Vamos fazer sua cotação.',
  ctaLabel: 'Começar',
  flowJson: { version: '6.2', screens: [] },
};

describe('FlowMessage', () => {
  it('shows the body and a call-to-action button', () => {
    render(<FlowMessage payload={payload} onOpen={() => undefined} />);
    expect(screen.getByText('Vamos fazer sua cotação.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Começar' })).toBeInTheDocument();
  });

  it('opens the flow with everything the host needs', async () => {
    const onOpen = vi.fn();
    render(<FlowMessage payload={{ ...payload, header: 'Cotação' }} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: 'Começar' }));
    expect(onOpen).toHaveBeenCalledWith({
      flowId: 'cotacao',
      ctaLabel: 'Começar',
      flowJson: payload.flowJson,
      header: 'Cotação',
      body: 'Vamos fazer sua cotação.',
    });
  });
});
