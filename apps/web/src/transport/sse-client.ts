import { createSseParser, type SseMessage } from './sse-parser';

export type DisconnectReason = 'network' | 'http' | 'timeout' | 'ended';

export interface SseClientOptions {
  url: string;
  fetchImpl?: typeof fetch;
  getLastEventId(): string | undefined;
  onMessage(message: SseMessage): void;
  onOpen?(): void;
  onDisconnect?(reason: DisconnectReason): void;
  onUnauthorized?(): void;
  heartbeatTimeoutMs?: number;
  backoff?: { baseMs: number; maxMs: number };
  random?(): number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Fetch-based SSE client: reconnects with jittered exponential backoff and `Last-Event-ID`. */
export class SseClient {
  private running = false;
  private generation = 0;
  private controller: AbortController | undefined;
  private serverRetryMs: number | undefined;

  constructor(private readonly o: SseClientOptions) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    const generation = ++this.generation;
    void this.loop(generation);
  }

  stop(): void {
    this.running = false;
    this.generation++;
    this.controller?.abort();
  }

  private delay(attempt: number): number {
    const { baseMs, maxMs } = this.o.backoff ?? { baseMs: 1000, maxMs: 30000 };
    const random = this.o.random ?? Math.random;
    const exponential = Math.min(maxMs, baseMs * 2 ** attempt);
    const jittered = exponential * (0.5 + random() / 2);
    return Math.max(this.serverRetryMs ?? 0, Math.round(jittered));
  }

  private async loop(generation: number): Promise<void> {
    const alive = () => this.running && this.generation === generation;
    const fetchImpl = this.o.fetchImpl ?? fetch;
    const heartbeatTimeoutMs = this.o.heartbeatTimeoutMs ?? 45000;
    let attempt = 0;

    while (alive()) {
      const controller = new AbortController();
      this.controller = controller;
      let reason: DisconnectReason = 'network';
      let timer: ReturnType<typeof setTimeout> | undefined;
      const arm = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          reason = 'timeout';
          controller.abort();
        }, heartbeatTimeoutMs);
      };

      try {
        const last = this.o.getLastEventId();
        const res = await fetchImpl(this.o.url, {
          headers: { accept: 'text/event-stream', ...(last ? { 'last-event-id': last } : {}) },
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!alive()) return;
        if (res.status === 401) {
          this.running = false;
          this.o.onUnauthorized?.();
          return;
        }
        if (!res.ok || !res.body) {
          reason = 'http';
        } else {
          attempt = 0;
          this.o.onOpen?.();
          arm();
          const parser = createSseParser({
            onMessage: (m) => this.o.onMessage(m),
            onRetry: (ms) => {
              this.serverRetryMs = ms;
            },
          });
          const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
          // A real fetch body errors on abort; make that explicit so any stream implementation unblocks the read.
          const onAbort = () => void reader.cancel().catch(() => undefined);
          if (controller.signal.aborted) onAbort();
          else controller.signal.addEventListener('abort', onAbort, { once: true });
          for (;;) {
            const { done, value } = await reader.read();
            if (!alive()) return;
            if (done) {
              if (!controller.signal.aborted) reason = 'ended';
              break;
            }
            arm();
            parser.feed(value);
          }
        }
      } catch {
        // aborted by stop() or by the heartbeat watchdog, or a network failure: `reason` says which
      } finally {
        clearTimeout(timer);
        // Idempotent: releases the HTTP body (via the abort listener) when we leave because of an error.
        controller.abort();
      }

      if (!alive()) return;
      this.o.onDisconnect?.(reason);
      await sleep(this.delay(attempt++));
    }
  }
}
