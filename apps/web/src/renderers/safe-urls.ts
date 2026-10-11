/** http(s) only: blocks javascript:, data:, vbscript: and malformed values. Never throws. */
export function safeHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** A `tel:` href built only from digits, +, spaces, parentheses and hyphens (spaces removed). */
export function safeTelHref(phone: string): string | undefined {
  return /^[\d+()\-\s]{3,30}$/.test(phone) ? `tel:${phone.replace(/\s+/g, '')}` : undefined;
}

/** Blob URLs created by this page for the user's own recordings. */
export function safeMediaUrl(value: string): string | undefined {
  if (value.startsWith('blob:')) return value;
  return safeHttpUrl(value);
}
