import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FlowPlaceholder } from './FlowPlaceholder';

const request = { flowId: 'f', ctaLabel: 'Ir', flowJson: {}, body: 'b' };

describe('FlowPlaceholder', () => {
  it('moves the focus to the close button and closes on Escape', async () => {
    const onClose = vi.fn();
    render(<FlowPlaceholder request={request} onClose={onClose} />);
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('returns the focus to the previously focused element on close', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const { unmount } = render(<FlowPlaceholder request={request} onClose={vi.fn()} />);
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });
});
