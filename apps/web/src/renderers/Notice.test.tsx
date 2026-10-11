import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Notice } from './Notice';

describe('Notice', () => {
  it('renders an info notice as a status', () => {
    render(<Notice tone="info" text="Nova conversa" />);
    expect(screen.getByRole('status')).toHaveTextContent('Nova conversa');
  });

  it('renders an error notice as an alert', () => {
    render(<Notice tone="error" text="Falhou" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Falhou');
  });

  it('renders the text as text', () => {
    const { container } = render(<Notice tone="info" text="<script>x</script>" />);
    expect(container.querySelector('script')).toBeNull();
  });
});
