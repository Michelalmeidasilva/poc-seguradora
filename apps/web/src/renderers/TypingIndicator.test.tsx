import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TypingIndicator } from './TypingIndicator';

describe('TypingIndicator', () => {
  it('has an accessible label and three dots', () => {
    const { container } = render(<TypingIndicator />);
    expect(screen.getByRole('status', { name: /digitando/i })).toBeInTheDocument();
    expect(container.querySelectorAll('.typing__dot')).toHaveLength(3);
  });
});
