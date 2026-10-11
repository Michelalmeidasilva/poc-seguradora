import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuickReplies } from './QuickReplies';

const options = [
  { id: 'menu.quote', title: 'Fazer cotação' },
  { id: 'menu.policies', title: 'Minhas apólices' },
];

describe('QuickReplies', () => {
  it('renders the text and one button per option', () => {
    render(
      <QuickReplies
        text="Escolha uma opção:"
        options={options}
        interactive
        onChoice={() => undefined}
      />,
    );
    expect(screen.getByText('Escolha uma opção:')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('calls onChoice with the option id and title', async () => {
    const onChoice = vi.fn();
    render(<QuickReplies text="x" options={options} interactive onChoice={onChoice} />);
    await userEvent.click(screen.getByRole('button', { name: 'Minhas apólices' }));
    expect(onChoice).toHaveBeenCalledWith('menu.policies', 'Minhas apólices');
  });

  it('disables the buttons once the conversation moved on', () => {
    render(
      <QuickReplies text="x" options={options} interactive={false} onChoice={() => undefined} />,
    );
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
  });

  it('is operable by keyboard', async () => {
    const onChoice = vi.fn();
    render(<QuickReplies text="x" options={options} interactive onChoice={onChoice} />);
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    expect(onChoice).toHaveBeenCalledWith('menu.quote', 'Fazer cotação');
  });
});
