import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LocationMessage } from './LocationMessage';

describe('LocationMessage', () => {
  it('shows the name and the address', () => {
    render(
      <LocationMessage
        latitude={-23.56}
        longitude={-46.65}
        name="Agência Paulista"
        address="Av. Paulista, 1000"
      />,
    );
    expect(screen.getByText('Agência Paulista')).toBeInTheDocument();
    expect(screen.getByText('Av. Paulista, 1000')).toBeInTheDocument();
  });

  it('opens the position in a map in a new tab, safely', () => {
    render(<LocationMessage latitude={-23.5614} longitude={-46.6559} />);
    const link = screen.getByRole('link', { name: /abrir no mapa/i });
    expect(link.getAttribute('href')).toBe('https://www.google.com/maps?q=-23.5614,-46.6559');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('falls back to the coordinates when there is no name', () => {
    render(<LocationMessage latitude={-23.5614} longitude={-46.6559} />);
    expect(screen.getByText('-23.5614, -46.6559')).toBeInTheDocument();
  });

  it('renders HTML in the name as text', () => {
    const { container } = render(
      <LocationMessage latitude={0} longitude={0} name="<img src=x onerror=alert(1)>" />,
    );
    expect(container.querySelector('img')).toBeNull();
  });

  it('does not build a map link from non-finite coordinates', () => {
    render(<LocationMessage latitude={Number.NaN} longitude={0} />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
