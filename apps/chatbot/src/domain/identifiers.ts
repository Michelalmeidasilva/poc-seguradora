import type { ClaimType } from './models';

const POLICY_RE = /^AP-\d{3,6}$/;
const PROTOCOL_RE = /^SN-\d{3,6}$/i;

/** Claim types offered to the user (the services accept more; the rest is covered by OUTROS). */
export const CLAIM_TYPES: readonly ClaimType[] = ['COLISAO', 'ROUBO', 'OUTROS'];

/**
 * Returns the 11 digits of a CPF typed with or without punctuation, or undefined.
 * Only the format is checked: the fixtures of the internal services use fictitious CPFs
 * without valid check digits.
 */
export function normalizeCpf(text: string): string | undefined {
  const trimmed = text.trim();
  if (!/^[\d.-]+$/.test(trimmed)) return undefined;
  const digits = trimmed.replace(/[.-]/g, '');
  return /^\d{11}$/.test(digits) ? digits : undefined;
}

export const isPolicyNumber = (s: string): boolean => POLICY_RE.test(s);

export const isClaimProtocol = (s: string): boolean => PROTOCOL_RE.test(s);

export function normalizeProtocol(s: string): string | undefined {
  const trimmed = s.trim();
  return PROTOCOL_RE.test(trimmed) ? trimmed.toUpperCase() : undefined;
}
