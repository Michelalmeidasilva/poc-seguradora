import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CarouselMessage } from './CarouselMessage';

const cards = [
  {
    mediaUrl: 'https://exemplo.invalid/1.png',
    mediaType: 'image' as const,
    title: 'Colisão',
    body: 'Limite: R$ 50.000,00',
    buttons: [],
  },
  {
    mediaUrl: 'https://exemplo.invalid/2.png',
    mediaType: 'image' as const,
    title: 'Roubo e furto',
    buttons: [],
  },
  {
    mediaUrl: 'https://exemplo.invalid/3.mp4',
    mediaType: 'video' as const,
    title: 'Vídeo',
    buttons: [],
  },
];

describe('CarouselMessage', () => {
  it('renders every card with its title and body', () => {
    render(<CarouselMessage cards={cards} />);
    expect(screen.getByText('Colisão')).toBeInTheDocument();
    expect(screen.getByText('Roubo e furto')).toBeInTheDocument();
    expect(screen.getByText('Limite: R$ 50.000,00')).toBeInTheDocument();
  });

  it('is a labelled region with a group per card', () => {
    render(<CarouselMessage cards={cards} />);
    expect(screen.getByRole('region', { name: /carrossel/i })).toBeInTheDocument();
    expect(screen.getAllByRole('group')).toHaveLength(3);
  });

  it('shows a placeholder when an image fails to load', () => {
    const { container } = render(<CarouselMessage cards={[cards[0] as (typeof cards)[number]]} />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    fireEvent.error(img as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.carousel__placeholder')).not.toBeNull();
  });

  it('renders a video card as a placeholder, never as an active element', () => {
    const { container } = render(<CarouselMessage cards={[cards[2] as (typeof cards)[number]]} />);
    expect(container.querySelector('video, iframe, script')).toBeNull();
  });

  it('never loads an image with an unsafe URL', () => {
    const { container } = render(
      <CarouselMessage
        cards={[{ mediaUrl: 'javascript:alert(1)', mediaType: 'image', title: 'x', buttons: [] }]}
      />,
    );
    expect(container.querySelector('img')).toBeNull();
  });

  it('scrolls with the previous and next buttons', () => {
    render(<CarouselMessage cards={cards} />);
    fireEvent.click(screen.getByRole('button', { name: /próximo/i }));
    fireEvent.click(screen.getByRole('button', { name: /anterior/i }));
    expect(Element.prototype.scrollTo).toHaveBeenCalled();
  });

  it('renders text as text', () => {
    const { container } = render(
      <CarouselMessage
        cards={[
          { mediaUrl: 'https://a.com/x.png', mediaType: 'image', title: '<b>x</b>', buttons: [] },
        ]}
      />,
    );
    expect(container.querySelector('b')).toBeNull();
  });
});
