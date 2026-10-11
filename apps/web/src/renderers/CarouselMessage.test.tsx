import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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
    render(<CarouselMessage cards={cards} interactive onChoice={() => undefined} />);
    expect(screen.getByText('Colisão')).toBeInTheDocument();
    expect(screen.getByText('Roubo e furto')).toBeInTheDocument();
    expect(screen.getByText('Limite: R$ 50.000,00')).toBeInTheDocument();
  });

  it('is a labelled region with a group per card', () => {
    render(<CarouselMessage cards={cards} interactive onChoice={() => undefined} />);
    expect(screen.getByRole('region', { name: /carrossel/i })).toBeInTheDocument();
    expect(screen.getAllByRole('group')).toHaveLength(3);
  });

  it('shows a placeholder when an image fails to load', () => {
    const { container } = render(
      <CarouselMessage
        cards={[cards[0] as (typeof cards)[number]]}
        interactive
        onChoice={() => undefined}
      />,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    fireEvent.error(img as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.carousel__placeholder')).not.toBeNull();
  });

  it('renders a video card as a placeholder, never as an active element', () => {
    const { container } = render(
      <CarouselMessage
        cards={[cards[2] as (typeof cards)[number]]}
        interactive
        onChoice={() => undefined}
      />,
    );
    expect(container.querySelector('video, iframe, script')).toBeNull();
  });

  it('never loads an image with an unsafe URL', () => {
    const { container } = render(
      <CarouselMessage
        cards={[{ mediaUrl: 'javascript:alert(1)', mediaType: 'image', title: 'x', buttons: [] }]}
        interactive
        onChoice={() => undefined}
      />,
    );
    expect(container.querySelector('img')).toBeNull();
  });

  it('scrolls with the previous and next buttons', () => {
    render(<CarouselMessage cards={cards} interactive onChoice={() => undefined} />);
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
        interactive
        onChoice={() => undefined}
      />,
    );
    expect(container.querySelector('b')).toBeNull();
  });

  it('is operable by keyboard', async () => {
    render(<CarouselMessage cards={cards} interactive onChoice={() => undefined} />);
    vi.mocked(Element.prototype.scrollTo).mockClear();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: /anterior/i })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(Element.prototype.scrollTo).toHaveBeenCalled();
  });

  describe('card buttons', () => {
    const buttonCards = [
      {
        mediaUrl: 'https://exemplo.invalid/1.png',
        mediaType: 'image' as const,
        title: 'Colisão',
        buttons: [
          { type: 'quick_reply' as const, id: 'quote.collision', title: 'Cotar' },
          { type: 'url' as const, title: 'Detalhes', url: 'https://exemplo.invalid/d' },
          { type: 'url' as const, title: 'Ruim', url: 'javascript:alert(1)' },
          { type: 'phone' as const, title: 'Ruim 2', phone: 'abc"x' },
        ],
      },
    ];

    it('calls onChoice for a quick reply when interactive', async () => {
      const onChoice = vi.fn();
      render(<CarouselMessage cards={buttonCards} interactive onChoice={onChoice} />);
      await userEvent.click(screen.getByRole('button', { name: 'Cotar' }));
      expect(onChoice).toHaveBeenCalledWith('quote.collision', 'Cotar');
    });

    it('disables quick replies but keeps links active when not interactive', () => {
      render(
        <CarouselMessage cards={buttonCards} interactive={false} onChoice={() => undefined} />,
      );
      expect(screen.getByRole('button', { name: 'Cotar' })).toBeDisabled();
      const link = screen.getByRole('link', { name: /Detalhes/ });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('drops unsafe url and phone buttons', () => {
      render(<CarouselMessage cards={buttonCards} interactive onChoice={() => undefined} />);
      expect(screen.queryByText('Ruim')).toBeNull();
      expect(screen.queryByText('Ruim 2')).toBeNull();
    });
  });
});
