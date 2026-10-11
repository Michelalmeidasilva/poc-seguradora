export interface SseMessage {
  id?: string;
  event?: string;
  data: string;
}

export interface SseParserHandlers {
  onMessage(message: SseMessage): void;
  onRetry?(ms: number): void;
  /** Called for comment lines (heartbeats). */
  onActivity?(): void;
}

const MAX_BUFFER = 1_000_000;

/** Incremental `text/event-stream` parser (blank-line dispatch, multi-line data, CRLF tolerant). */
export function createSseParser(handlers: SseParserHandlers) {
  let buffer = '';
  let id: string | undefined;
  let event: string | undefined;
  let data: string[] = [];

  const dispatch = () => {
    if (data.length > 0) {
      handlers.onMessage({
        ...(id !== undefined ? { id } : {}),
        ...(event !== undefined ? { event } : {}),
        data: data.join('\n'),
      });
    }
    id = undefined;
    event = undefined;
    data = [];
  };

  const onLine = (line: string) => {
    if (line === '') return dispatch();
    if (line.startsWith(':')) return handlers.onActivity?.();
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    switch (field) {
      case 'id':
        id = value;
        break;
      case 'event':
        event = value;
        break;
      case 'data':
        data.push(value);
        break;
      case 'retry':
        if (/^\d+$/.test(value)) handlers.onRetry?.(Number(value));
        break;
    }
  };

  return {
    feed(chunk: string): void {
      buffer += chunk;
      if (buffer.length > MAX_BUFFER) {
        buffer = '';
        throw new Error('SSE buffer limit exceeded');
      }
      for (;;) {
        const m = /\r\n|\n|\r/.exec(buffer);
        if (!m) return;
        // A lone \r at the very end may be the first half of \r\n: wait for more data.
        if (m[0] === '\r' && m.index === buffer.length - 1) return;
        const line = buffer.slice(0, m.index);
        buffer = buffer.slice(m.index + m[0].length);
        onLine(line);
      }
    },
  };
}
