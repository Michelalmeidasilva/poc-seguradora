import { parseServerEvent, type ClientEvent, type ServerEvent } from '@seguradora/protocol';
import { SseClient, type SseClientOptions } from './sse-client';
import { randomId } from './random-id';
import type { SseMessage } from './sse-parser';

export type Draft =
  | { type: 'user.text'; payload: { text: string } }
  | { type: 'user.voice'; payload: { mediaId: string; durationMs: number } }
  | { type: 'user.quick_reply'; payload: { optionId: string; replyToId: string } }
  | { type: 'user.flow_submit'; payload: { flowId: string; data: Record<string, unknown> } }
  | {
      type: 'user.flow_data_exchange';
      payload: { flowId: string; screen: string; action: string; data: Record<string, unknown> };
    };

export type OutgoingStatus = 'sending' | 'sent' | 'failed';
export type ConnectionState = 'connecting' | 'online' | 'reconnecting' | 'offline';

export interface ChatClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  newId?(): string;
  now?(): number;
  createSse?(o: SseClientOptions): { start(): void; stop(): void };
  onServerEvent(event: ServerEvent): void;
  onConnection(connection: ConnectionState): void;
  onOutgoing(id: string, status: OutgoingStatus): void;
  onSession(sessionId: string, kind: 'new' | 'resumed'): void;
  onSessionReset(): void;
  ackDelayMs?: number;
  maxSendAttempts?: number;
  retryBaseMs?: number;
}

interface OutboxEntry {
  id: string;
  draft: Draft;
  ts: string;
}

type PostResult =
  | { kind: 'ok' }
  | { kind: 'unauthorized' }
  | { kind: 'rate_limited'; retryAfterMs: number }
  | { kind: 'rejected' }
  | { kind: 'retry' };

const OUTBOX_LIMIT = 50;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class ChatClient {
  private sessionIdValue: string | undefined;
  private lastSeq = 0;
  private ackedSeq = 0;
  private stopped = true;
  private sse: { start(): void; stop(): void } | undefined;
  private ackTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly outbox = new Map<string, OutboxEntry>();
  private generation = 0;
  private resetAttempts = 0;
  private establishing: Promise<void> | undefined;
  /** Ids already reported as `sent`/`failed`; everything else in the outbox is still in flight. */
  private readonly settled = new Set<string>();
  private mismatchResetFor: string | undefined;

  constructor(private readonly o: ChatClientOptions) {}

  get sessionId(): string | undefined {
    return this.sessionIdValue;
  }

  private get base(): string {
    return this.o.baseUrl ?? '';
  }

  private get fetchImpl(): typeof fetch {
    // Bound: the browser's fetch throws "Illegal invocation" when called with this = ChatClient.
    return this.o.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  private newId(): string {
    return (this.o.newId ?? randomId)();
  }

  async start(initial?: { sessionId: string; lastSeq: number }): Promise<void> {
    this.stopped = false;
    this.resetAttempts = 0;
    const generation = ++this.generation;
    if (initial) {
      this.sessionIdValue = initial.sessionId;
      this.lastSeq = initial.lastSeq;
      this.ackedSeq = initial.lastSeq;
      this.o.onSession(initial.sessionId, 'resumed');
      this.startStream(generation);
    } else {
      this.sessionIdValue = undefined;
      await this.establish(generation, false);
    }
  }

  stop(): void {
    const wasRunning = !this.stopped;
    this.stopped = true;
    this.generation++;
    clearTimeout(this.ackTimer);
    this.ackTimer = undefined;
    this.sse?.stop();
    this.sse = undefined;
    this.establishing = undefined;
    // Deliveries of this generation end silently now: give every in-flight entry a final status.
    if (wasRunning) {
      for (const id of this.outbox.keys()) {
        if (!this.settled.has(id)) {
          this.settled.add(id);
          this.o.onOutgoing(id, 'failed');
        }
      }
    }
  }

  send(draft: Draft): string {
    const id = this.newId();
    const entry: OutboxEntry = {
      id,
      draft,
      ts: new Date((this.o.now ?? Date.now)()).toISOString(),
    };
    this.outbox.set(id, entry);
    if (this.outbox.size > OUTBOX_LIMIT) {
      const oldest = this.outbox.keys().next().value;
      if (oldest !== undefined) this.outbox.delete(oldest);
    }
    this.settled.delete(id);
    this.o.onOutgoing(id, 'sending');
    void this.deliver(entry);
    return id;
  }

  /**
   * Re-delivers a message with the same id. An id unknown to this client (e.g. restored after a
   * reload) is seeded from `draft`; without a draft it is a no-op returning false.
   */
  resend(id: string, draft?: Draft): boolean {
    let entry = this.outbox.get(id);
    if (!entry) {
      if (!draft) return false;
      entry = { id, draft, ts: new Date((this.o.now ?? Date.now)()).toISOString() };
      this.outbox.set(id, entry);
      if (this.outbox.size > OUTBOX_LIMIT) {
        const oldest = this.outbox.keys().next().value;
        if (oldest !== undefined) this.outbox.delete(oldest);
      }
    }
    this.settled.delete(id);
    this.o.onOutgoing(id, 'sending');
    void this.deliver(entry);
    return true;
  }

  // ---- session ---------------------------------------------------------------------------

  private alive(generation: number): boolean {
    return !this.stopped && this.generation === generation;
  }

  /** Returns the new session id, or undefined when this generation was stopped meanwhile. */
  private async createSession(generation: number): Promise<string | undefined> {
    this.o.onConnection('connecting');
    for (let attempt = 0; this.alive(generation); attempt++) {
      try {
        const res = await this.fetchImpl(`${this.base}/v1/session`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!this.alive(generation)) return undefined;
        if (res.status === 201) {
          const body = (await res.json()) as { sessionId?: unknown };
          if (!this.alive(generation)) return undefined;
          if (typeof body.sessionId === 'string') return body.sessionId;
        }
      } catch {
        // network failure: retry below
      }
      if (!this.alive(generation)) return undefined;
      this.o.onConnection('offline');
      await sleep(Math.min(30000, (this.o.retryBaseMs ?? 500) * 2 ** attempt));
    }
    return undefined;
  }

  /** The single readiness promise: covers the initial session and every reset. */
  private establish(generation: number, isReset: boolean): Promise<void> {
    if (this.establishing) return this.establishing;
    if (isReset) this.sse?.stop();
    const self: { promise?: Promise<void> } = {};
    const promise = (async () => {
      try {
        // A fresh session that is rejected again must not turn into a hot loop.
        if (isReset && this.resetAttempts > 0) {
          await sleep(Math.min(30000, (this.o.retryBaseMs ?? 500) * 2 ** (this.resetAttempts - 1)));
        }
        if (isReset) this.resetAttempts++;
        if (!this.alive(generation)) return;
        const sessionId = await this.createSession(generation);
        if (sessionId === undefined || !this.alive(generation)) return;
        this.sessionIdValue = sessionId;
        this.lastSeq = 0;
        this.ackedSeq = 0;
        this.o.onSession(sessionId, 'new');
        if (isReset) this.o.onSessionReset();
        this.startStream(generation);
      } finally {
        if (this.establishing === self.promise) this.establishing = undefined;
      }
    })();
    self.promise = promise;
    this.establishing = promise;
    return promise;
  }

  private resetSession(generation: number): Promise<void> {
    return this.establish(generation, true);
  }

  // ---- stream ----------------------------------------------------------------------------

  private startStream(generation: number): void {
    this.sse?.stop();
    const streamSession = this.sessionIdValue;
    const options: SseClientOptions = {
      url: `${this.base}/v1/stream`,
      ...(this.o.fetchImpl ? { fetchImpl: this.o.fetchImpl } : {}),
      getLastEventId: () => (this.lastSeq > 0 ? String(this.lastSeq) : undefined),
      onMessage: (m) => this.handleMessage(m),
      onOpen: () => {
        this.resetAttempts = 0;
        this.o.onConnection('online');
      },
      onDisconnect: () => this.o.onConnection('reconnecting'),
      onUnauthorized: () => {
        // Ignore a late 401 from a stream of a session that was already replaced.
        if (!this.alive(generation) || this.establishing || this.sessionIdValue !== streamSession)
          return;
        void this.resetSession(generation);
      },
    };
    this.sse = (this.o.createSse ?? ((opts) => new SseClient(opts)))(options);
    this.sse.start();
  }

  private handleMessage(message: SseMessage): void {
    let json: unknown;
    try {
      json = JSON.parse(message.data);
    } catch {
      return;
    }
    const parsed = parseServerEvent(json);
    if (!parsed.ok) return;
    const event = parsed.value;
    if (event.sessionId !== this.sessionIdValue) {
      // The stream authenticates by the shared cookie: a foreign session id means another tab
      // replaced it. Drop the event and move to a fresh session, once per stale session.
      const stale = this.sessionIdValue;
      if (
        !this.stopped &&
        !this.establishing &&
        stale !== undefined &&
        this.mismatchResetFor !== stale
      ) {
        this.mismatchResetFor = stale;
        void this.resetSession(this.generation);
      }
      return;
    }
    // Advance the cursor first: a throwing consumer must not cause an endless replay.
    if (event.seq > this.lastSeq) this.lastSeq = event.seq;
    try {
      this.o.onServerEvent(event);
    } catch (error) {
      // Keep the stream alive, but re-surface the error (no content is logged here).
      if (typeof globalThis.reportError === 'function') globalThis.reportError(error);
      else
        queueMicrotask(() => {
          throw error;
        });
    }
    this.scheduleAck();
  }

  private scheduleAck(): void {
    if (this.ackTimer || this.stopped) return;
    this.ackTimer = setTimeout(() => {
      this.ackTimer = undefined;
      if (this.stopped || this.lastSeq <= this.ackedSeq || !this.sessionIdValue) return;
      const lastSeq = this.lastSeq;
      this.ackedSeq = lastSeq;
      // Best effort: an ack that fails is simply superseded by the next one.
      void this.post(
        this.envelope(this.newId(), new Date((this.o.now ?? Date.now)()).toISOString(), {
          type: 'user.ack',
          payload: { lastSeq },
        }),
      ).catch(() => undefined);
    }, this.o.ackDelayMs ?? 300);
  }

  // ---- sending ---------------------------------------------------------------------------

  private envelope(
    id: string,
    ts: string,
    draft: Draft | { type: 'user.ack'; payload: { lastSeq: number } },
  ): ClientEvent {
    return {
      v: 1,
      id,
      sessionId: this.sessionIdValue ?? '',
      correlationId: `web-${id}`,
      ts,
      ...draft,
    } as ClientEvent;
  }

  private async post(event: ClientEvent): Promise<PostResult> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}/v1/events`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(event),
      });
    } catch {
      return { kind: 'retry' };
    }
    if (res.status === 202 || res.status === 200) return { kind: 'ok' };
    // 403 = the cookie's session differs from the envelope's (another tab replaced the cookie).
    if (res.status === 401 || res.status === 403) return { kind: 'unauthorized' };
    if (res.status === 429) {
      const seconds = Number(res.headers.get('retry-after'));
      return {
        kind: 'rate_limited',
        retryAfterMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 1000,
      };
    }
    if (res.status >= 500) return { kind: 'retry' };
    return { kind: 'rejected' };
  }

  private async deliver(entry: OutboxEntry): Promise<void> {
    const maxAttempts = this.o.maxSendAttempts ?? 4;
    const maxSessionResets = 2;
    const retryBase = this.o.retryBaseMs ?? 500;
    const generation = this.generation;
    let attempts = 0;
    let sessionResets = 0;

    while (this.alive(generation)) {
      // Never post before a session exists or while one is being (re)created.
      while (this.establishing) await this.establishing;
      if (!this.alive(generation) || !this.sessionIdValue) return;
      const event = this.envelope(entry.id, entry.ts, entry.draft);
      attempts++;
      const result = await this.post(event);
      if (!this.alive(generation)) return;

      switch (result.kind) {
        case 'ok':
          this.settled.add(entry.id);
          this.o.onOutgoing(entry.id, 'sent');
          return;
        case 'rejected':
          this.settled.add(entry.id);
          this.o.onOutgoing(entry.id, 'failed');
          return;
        case 'unauthorized':
          attempts--; // a session change is not the message's fault
          if (this.sessionIdValue === event.sessionId && !this.establishing) {
            // Only the first 401 of a session resets it; late ones just retry in the new session.
            if (sessionResets >= maxSessionResets) break;
            if (sessionResets > 0) await sleep(retryBase * 2 ** (sessionResets - 1));
            if (!this.alive(generation)) return;
            sessionResets++;
            await this.resetSession(generation);
          }
          continue;
        case 'rate_limited':
          if (attempts >= maxAttempts) break;
          await sleep(result.retryAfterMs);
          continue;
        case 'retry':
          if (attempts >= maxAttempts) break;
          await sleep(retryBase * 2 ** (attempts - 1));
          continue;
      }
      this.settled.add(entry.id);
      this.o.onOutgoing(entry.id, 'failed');
      return;
    }
  }
}
