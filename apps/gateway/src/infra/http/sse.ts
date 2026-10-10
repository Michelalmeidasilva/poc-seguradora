import type { ServerEvent } from '@seguradora/protocol';

/** One SSE message: `id` is the event's seq so the browser resumes with `Last-Event-ID`. */
export function formatSseEvent(event: ServerEvent): string {
  // JSON.stringify never emits a raw newline, so `data` is always a single line.
  return `id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/** Parses the `Last-Event-ID` header; anything that is not a safe non-negative integer is 0. */
export function parseLastEventId(header: string | string[] | undefined): number {
  const value = Array.isArray(header) ? header[0] : header;
  if (value === undefined || !/^\d{1,15}$/.test(value)) return 0;
  return Number(value);
}
