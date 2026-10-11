import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DateSeparator } from './DateSeparator';

describe('DateSeparator', () => {
  it('shows the label', () => {
    render(<DateSeparator label="Hoje" />);
    expect(screen.getByText('Hoje')).toBeInTheDocument();
  });
});
