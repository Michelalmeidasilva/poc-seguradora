export interface SseMessage {
  id?: string;
  event?: string;
  data?: string;
}

export interface SseConnection {
  status: number;
  headers: Headers;
  messages: SseMessage[];
  /** Everything received so far, including comments and the retry hint. */
  raw(): string;
  waitFor(count: number, timeoutMs?: number): Promise<SseMessage[]>;
  /** Resolves when the server (or `close`) ended the stream. */
  closed: Promise<void>;
  close(): void;
}

export interface OpenSseOptions {
  cookie?: string;
  lastEventId?: string;
  origin?: string;
}

export async function openSse(url: string, o: OpenSseOptions = {}): Promise<SseConnection> {
  const controller = new AbortController();
  const response = await fetch(url, {
    headers: {
      accept: 'text/event-stream',
      ...(o.cookie ? { cookie: o.cookie } : {}),
      ...(o.lastEventId ? { 'last-event-id': o.lastEventId } : {}),
      ...(o.origin ? { origin: o.origin } : {}),
    },
    signal: controller.signal,
  });

  const messages: SseMessage[] = [];
  let raw = '';
  let notify: () => void = () => {};

  const parseBlock = (block: string) => {
    const message: SseMessage = {};
    for (const line of block.split('\n')) {
      if (line.startsWith('id: ')) message.id = line.slice(4);
      else if (line.startsWith('event: ')) message.event = line.slice(7);
      else if (line.startsWith('data: ')) message.data = line.slice(6);
    }
    if (message.data !== undefined) messages.push(message);
  };

  const closed = (async () => {
    if (!response.body) return;
    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        raw += text;
        buffer += text;
        let end = buffer.indexOf('\n\n');
        while (end >= 0) {
          parseBlock(buffer.slice(0, end));
          buffer = buffer.slice(end + 2);
          end = buffer.indexOf('\n\n');
        }
        notify();
      }
    } catch {
      // An aborted fetch ends the stream; tests only care that it ended.
    }
    notify();
  })();

  return {
    status: response.status,
    headers: response.headers,
    messages,
    raw: () => raw,
    closed,
    close: () => controller.abort(),
    async waitFor(count, timeoutMs = 2000) {
      const deadline = Date.now() + timeoutMs;
      while (messages.length < count) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          throw new Error(
            `timed out waiting for ${count} SSE messages, got ${messages.length}: ${JSON.stringify(messages)}`,
          );
        }
        await new Promise<void>((resolve) => {
          notify = resolve;
          setTimeout(resolve, Math.min(remaining, 50));
        });
      }
      return messages;
    },
  };
}
