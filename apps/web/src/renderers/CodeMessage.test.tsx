import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeMessage } from './CodeMessage';

describe('CodeMessage', () => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  const restore = () => {
    if (original) Object.defineProperty(navigator, 'clipboard', original);
    else Reflect.deleteProperty(navigator, 'clipboard');
  };
  beforeEach(restore);
  afterEach(restore);

  it('renders the code as text in a monospace block', () => {
    const { container } = render(<CodeMessage code={'<b>x</b>\nlinha 2'} />);
    expect(container.querySelector('pre code')).toHaveTextContent('<b>x</b>');
    expect(container.querySelector('b')).toBeNull();
  });

  it('shows the language when given', () => {
    render(<CodeMessage code="x" language="ts" />);
    expect(screen.getByText('ts')).toBeInTheDocument();
  });

  it('copies the code to the clipboard and confirms', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<CodeMessage code="Protocolo: SN-2002" />);
    await userEvent.click(screen.getByRole('button', { name: /copiar/i }));
    expect(writeText).toHaveBeenCalledWith('Protocolo: SN-2002');
    expect(await screen.findByText(/copiado/i)).toBeInTheDocument();
  });

  it('does not crash when the clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    render(<CodeMessage code="x" />);
    await userEvent.click(screen.getByRole('button', { name: /copiar/i }));
    expect(screen.getByRole('button', { name: /copiar/i })).toBeInTheDocument();
  });
});
