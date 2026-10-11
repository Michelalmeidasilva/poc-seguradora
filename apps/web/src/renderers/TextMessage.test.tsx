import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormattedText } from './TextMessage';

describe('FormattedText', () => {
  it('renders bold, italic, strike and mono with semantic elements', () => {
    const { container } = render(<FormattedText text="*a* _b_ ~c~ `d`" />);
    expect(container.querySelector('strong')).toHaveTextContent('a');
    expect(container.querySelector('em')).toHaveTextContent('b');
    expect(container.querySelector('del')).toHaveTextContent('c');
    expect(container.querySelector('code')).toHaveTextContent('d');
  });

  it('renders links that open safely in a new tab', () => {
    render(<FormattedText text="veja https://exemplo.com/x" />);
    const link = screen.getByRole('link', { name: 'https://exemplo.com/x' });
    expect(link).toHaveAttribute('href', 'https://exemplo.com/x');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders HTML and script text as plain text', () => {
    const { container } = render(
      <FormattedText text={'<script>alert(1)</script> <img src=x onerror=alert(1)>'} />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container).toHaveTextContent('<script>alert(1)</script>');
  });

  it('does not make a link out of a javascript: URL', () => {
    render(<FormattedText text="clique javascript:alert(1)" />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('keeps line breaks in the text', () => {
    const { container } = render(<FormattedText text={'linha 1\nlinha 2'} />);
    expect(container.textContent).toBe('linha 1\nlinha 2');
  });
});
