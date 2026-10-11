const dayKey = (d: Date, locale: string, timeZone?: string): string =>
  new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(d);

export function formatTime(iso: string, locale = 'pt-BR', timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

export function sameDay(a: string, b: string, timeZone?: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return dayKey(da, 'pt-BR', timeZone) === dayKey(db, 'pt-BR', timeZone);
}

export function formatDay(iso: string, now: Date, locale = 'pt-BR', timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const key = dayKey(date, locale, timeZone);
  if (key === dayKey(now, locale, timeZone)) return 'Hoje';
  if (key === dayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000), locale, timeZone)) {
    return 'Ontem';
  }
  return key;
}
