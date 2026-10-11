import { useState } from 'react';
import '../flows.css';
import { useFlow } from '../FlowContext';
import { interpolate } from '../expr';
import type { FlowAction } from '../schema';
import { prop } from './field';
import { clampSide, safeImageSrc } from './media';

type C = Record<string, unknown>;

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** The component's raw action object, or undefined when it is not one. */
export const actionOf = (v: unknown): FlowAction | undefined =>
  isRecord(v) && typeof v.name === 'string' ? (v as unknown as FlowAction) : undefined;

export function Image({ c }: { c: C }) {
  const { scope } = useFlow();
  const src = safeImageSrc(prop(c, 'src'));
  if (!src) return null;
  const alt = prop(c, 'alt-text');
  const fit = prop(c, 'scale-type') === 'cover' ? 'cover' : 'contain';
  const width = clampSide(prop(c, 'width'));
  const height = clampSide(prop(c, 'height'));
  return (
    <img
      className="flow-image"
      src={src}
      alt={typeof alt === 'string' ? interpolate(alt, scope) : ''}
      width={width}
      height={height}
      style={{
        objectFit: fit,
        ...(width ? { width: `${width}px` } : {}),
        ...(height ? { height: `${height}px` } : {}),
      }}
      referrerPolicy="no-referrer"
      loading="lazy"
    />
  );
}

export function EmbeddedLink({ c }: { c: C }) {
  const { scope, runAction } = useFlow();
  const action = actionOf(prop(c, 'on-click-action'));
  const text = prop(c, 'text');
  return (
    <button
      type="button"
      className="flow-link flow-link--inline"
      disabled={!action}
      onClick={() => action && runAction(action)}
    >
      {typeof text === 'string' ? interpolate(text, scope) : ''}
    </button>
  );
}

const MAX_SLIDES = 10;

export function ImageCarousel({ c }: { c: C }) {
  const { scope } = useFlow();
  const [index, setIndex] = useState(0);
  const raw = prop(c, 'images');
  const slides = (Array.isArray(raw) ? raw : [])
    .map((i: unknown) => {
      const src = isRecord(i) ? safeImageSrc(i.src) : undefined;
      const alt = isRecord(i) && typeof i['alt-text'] === 'string' ? i['alt-text'] : '';
      return src ? { src, alt: interpolate(alt, scope) } : undefined;
    })
    .filter((s): s is { src: string; alt: string } => s !== undefined)
    .slice(0, MAX_SLIDES);
  if (slides.length === 0) return null;
  const at = Math.min(index, slides.length - 1);
  const go = (to: number) => setIndex(Math.max(0, Math.min(slides.length - 1, to)));
  const slide = slides[at];
  if (!slide) return null;
  return (
    <div
      className="flow-carousel"
      role="group"
      aria-roledescription="carousel"
      aria-label="Carrossel de imagens"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          go(at + 1);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          go(at - 1);
        }
      }}
    >
      <div
        className="flow-carousel__slide"
        role="group"
        aria-roledescription="slide"
        aria-label={`${at + 1} de ${slides.length}`}
        aria-live="polite"
      >
        <img
          className="flow-carousel__img"
          src={slide.src}
          alt={slide.alt}
          referrerPolicy="no-referrer"
        />
      </div>
      <div className="flow-carousel__bar">
        <button
          type="button"
          className="flow-carousel__btn"
          aria-label="Imagem anterior"
          disabled={at === 0}
          onClick={() => go(at - 1)}
        >
          ‹
        </button>
        <span className="flow-carousel__count">{`${at + 1} de ${slides.length}`}</span>
        <button
          type="button"
          className="flow-carousel__btn"
          aria-label="Próxima imagem"
          disabled={at === slides.length - 1}
          onClick={() => go(at + 1)}
        >
          ›
        </button>
      </div>
    </div>
  );
}
