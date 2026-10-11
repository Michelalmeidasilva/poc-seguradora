import { safeHttpUrl } from '../../renderers/safe-urls';

const DATA_IMAGE = /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_DATA_URL = 4_000_000;
const MAX_SIDE = 2000;

/** http(s) or a raster base64 data URL; anything else (svg, javascript:, file:) is rejected. */
export function safeImageSrc(src: unknown): string | undefined {
  if (typeof src !== 'string') return undefined;
  if (src.startsWith('data:')) {
    return src.length <= MAX_DATA_URL && DATA_IMAGE.test(src) ? src : undefined;
  }
  return safeHttpUrl(src);
}

/** Positive finite number clamped to a sensible maximum. */
export function clampSide(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(v, MAX_SIDE) : undefined;
}
