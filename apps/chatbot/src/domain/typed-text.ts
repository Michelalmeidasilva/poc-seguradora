import type { ClaimType } from './models';

/** Lower-cases and removes diacritics ("Colisão" → "colisao"). */
export const foldText = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const CANCEL_WORDS = new Set(['cancelar', 'cancela']);

/** True only when the whole message is the word "cancelar" (free-text steps use this). */
export const isExactCancel = (text: string): boolean => CANCEL_WORDS.has(foldText(text).trim());

const CLAIM_TYPE_WORDS: ReadonlyArray<[ClaimType, ReadonlySet<string>]> = [
  ['COLISAO', new Set(['colisao', 'colidi', 'bati', 'batida', 'acidente'])],
  ['ROUBO', new Set(['roubo', 'roubaram', 'roubado', 'furto', 'furtaram', 'assalto'])],
  ['OUTROS', new Set(['outro', 'outros', 'outra'])],
];

/**
 * Maps a typed answer to one of the offered claim types by whole words. Returns undefined when
 * nothing matches or when the words point to more than one type (the user is asked again).
 */
export function claimTypeFromText(text: string): ClaimType | undefined {
  const words = foldText(text).split(/[^a-z0-9]+/u);
  const found = CLAIM_TYPE_WORDS.filter(([, set]) => words.some((w) => set.has(w)));
  return found.length === 1 ? found[0]?.[0] : undefined;
}
