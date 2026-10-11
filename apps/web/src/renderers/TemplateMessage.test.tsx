import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TemplateMessage } from './TemplateMessage';

const payload = {
  header: 'Apólice AP-1001',
  body: 'Produto: Auto\nSituação: Ativa',
  footer: 'Valores sujeitos a análise.',
  buttons: [
    { type: 'quick_reply' as const, id: 'policy.second_copy:AP-1001', title: 'Segunda via' },
    {
      type: 'url' as const,
      title: 'Abrir documento',
      url: 'https://exemplo.invalid/docs/AP-1001.pdf',
    },
    { type: 'phone' as const, title: 'Ligar', phone: '+55 (11) 4000-1234' },
  ],
};

describe('TemplateMessage', () => {
  it('renders the header, body and footer', () => {
    render(<TemplateMessage payload={payload} interactive onChoice={() => undefined} />);
    expect(screen.getByText('Apólice AP-1001')).toBeInTheDocument();
    expect(screen.getByText(/Situação: Ativa/)).toBeInTheDocument();
    expect(screen.getByText('Valores sujeitos a análise.')).toBeInTheDocument();
  });

  it('sends the id and title of a quick reply button', async () => {
    const onChoice = vi.fn();
    render(<TemplateMessage payload={payload} interactive onChoice={onChoice} />);
    await userEvent.click(screen.getByRole('button', { name: 'Segunda via' }));
    expect(onChoice).toHaveBeenCalledWith('policy.second_copy:AP-1001', 'Segunda via');
  });

  it('disables quick reply buttons when the message is no longer interactive', () => {
    render(<TemplateMessage payload={payload} interactive={false} onChoice={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Segunda via' })).toBeDisabled();
  });

  it('opens URL buttons in a new tab safely, even when not interactive', () => {
    render(<TemplateMessage payload={payload} interactive={false} onChoice={() => undefined} />);
    const link = screen.getByRole('link', { name: /Abrir documento/ });
    expect(link).toHaveAttribute('href', 'https://exemplo.invalid/docs/AP-1001.pdf');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('builds a tel: link only from safe phone characters', () => {
    render(<TemplateMessage payload={payload} interactive onChoice={() => undefined} />);
    expect(screen.getByRole('link', { name: /Ligar/ })).toHaveAttribute(
      'href',
      'tel:+55(11)4000-1234',
    );
  });

  it('drops a button with an unsafe URL or phone', () => {
    render(
      <TemplateMessage
        payload={{
          body: 'x',
          buttons: [
            { type: 'url', title: 'Ruim', url: 'javascript:alert(1)' },
            { type: 'phone', title: 'Ruim 2', phone: 'abc"onmouseover=x' },
          ],
        }}
        interactive
        onChoice={() => undefined}
      />,
    );
    expect(screen.queryByText('Ruim')).toBeNull();
    expect(screen.queryByText('Ruim 2')).toBeNull();
  });

  it('renders the body with WhatsApp formatting as text', () => {
    const { container } = render(
      <TemplateMessage
        payload={{ body: '*negrito* <b>x</b>', buttons: [] }}
        interactive
        onChoice={() => undefined}
      />,
    );
    expect(container.querySelector('strong')).toHaveTextContent('negrito');
    expect(container.querySelector('b')).toBeNull();
  });
});
