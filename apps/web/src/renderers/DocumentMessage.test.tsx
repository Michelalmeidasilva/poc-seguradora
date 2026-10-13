import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DocumentPayloadSchema } from '@seguradora/protocol';
import { describe, expect, it } from 'vitest';
import { DocumentMessage } from './DocumentMessage';

const documents = {
  documents: [
    { id: 'contract', title: 'Resumo do contrato', status: 'available' as const },
    { id: 'receipt', title: 'Comprovante', status: 'generating' as const },
  ],
};

describe('DocumentMessage', () => {
  it('rejects an empty document list at the protocol schema boundary', () => {
    expect(DocumentPayloadSchema.safeParse({ documents: [] }).success).toBe(false);
  });

  it('shows available and generating states, with open only for available items', () => {
    render(<DocumentMessage payload={documents} />);

    expect(screen.getAllByText('Resumo do contrato')).toHaveLength(2);
    expect(screen.getByText('Disponível')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir Resumo do contrato' })).toBeInTheDocument();
    expect(screen.getByText('Comprovante')).toBeInTheDocument();
    expect(screen.getByText('Em geração')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abrir Comprovante' })).not.toBeInTheDocument();
  });

  it('opens a named demonstrative dialog, focuses it, closes with Escape and restores focus', async () => {
    const user = userEvent.setup();
    render(<DocumentMessage payload={documents} />);
    const trigger = screen.getByRole('button', { name: 'Abrir Resumo do contrato' });

    await user.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Resumo do contrato' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText(/conteúdo demonstrativo/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('closes the dialog with its close button', async () => {
    const user = userEvent.setup();
    render(<DocumentMessage payload={documents} />);
    await user.click(screen.getByRole('button', { name: 'Abrir Resumo do contrato' }));
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps Tab and Shift+Tab within the modal while leaving Escape available', async () => {
    const user = userEvent.setup();
    render(<DocumentMessage payload={documents} />);
    await user.click(screen.getByRole('button', { name: 'Abrir Resumo do contrato' }));

    const closeButton = screen.getByRole('button', { name: 'Fechar' });
    await user.tab();
    expect(closeButton).toHaveFocus();
    await user.tab({ shift: true });
    expect(closeButton).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
