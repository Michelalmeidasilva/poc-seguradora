import { useRef, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '../ui/icons';
import './renderers.css';
import { safeHttpUrl } from './safe-urls';

export interface CarouselCard {
  mediaUrl: string;
  mediaType: 'image' | 'video';
  title: string;
  body?: string | undefined;
  buttons: unknown[];
}

function CardMedia({ card }: { card: CarouselCard }) {
  const [failed, setFailed] = useState(false);
  const src = card.mediaType === 'image' ? safeHttpUrl(card.mediaUrl) : undefined;
  if (!src || failed) {
    return (
      <div className="carousel__placeholder" aria-hidden="true">
        {card.mediaType === 'video' ? 'Vídeo' : card.title.slice(0, 1).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      className="carousel__image"
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export function CarouselMessage({ cards }: { cards: CarouselCard[] }) {
  const track = useRef<HTMLDivElement>(null);
  const scrollBy = (direction: -1 | 1) => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: el.scrollLeft + direction * 240, behavior: 'smooth' });
  };

  return (
    <section className="carousel" aria-label="Carrossel de opções">
      <button
        type="button"
        className="carousel__nav carousel__nav--prev"
        aria-label="Anterior"
        onClick={() => scrollBy(-1)}
      >
        <ChevronLeftIcon />
      </button>
      <div className="carousel__track" ref={track}>
        {cards.map((card, index) => (
          <div
            key={`${card.title}-${index}`}
            className="carousel__card"
            role="group"
            aria-label={card.title}
          >
            <CardMedia card={card} />
            <strong className="carousel__title">{card.title}</strong>
            {card.body ? <span className="carousel__body">{card.body}</span> : null}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="carousel__nav carousel__nav--next"
        aria-label="Próximo"
        onClick={() => scrollBy(1)}
      >
        <ChevronRightIcon />
      </button>
    </section>
  );
}
