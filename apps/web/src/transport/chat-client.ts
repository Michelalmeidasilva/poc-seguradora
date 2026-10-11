import { parseServerEvent, type ClientEvent, type ServerEvent } from '@seguradora/protocol';
import { SseClient, type SseClientOptions } from './sse-client';
import type { SseMessage } from './sse-parser';

export type Draft =
  | { type: 'user.text'; payload: { text: string } }
  | { type: 'user.voice'; payload: { mediaId: string; durationMs: number } }
  | { type: 'user.quick_reply'; payload: { optionId: string; replyToId: string } }
  | { type: 'user.flow_submit'; payload: { flowId: string; data: Record<string, unknown> } };

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
  private resetting: Promise<void> | undefined;
  private generation = 0;
  private resetAttempts = 0;

  constructor(private readonly o: ChatClientOptions) {}

  get sessionId(): string | undefined {
    return this.sessionIdValue;
  }

  private get base(): string {
    return this.o.baseUrl ?? '';
  }

  private get fetchImpl(): typeof fetch {
    return this.o.fetchImpl ?? fetch;
  }

  private newId(): string {
    return (this.o.newId ?? (() => crypto.randomUUID()))();
  }

  async start(initial?: { sessionId: string; lastSeq: number }): Promise<void> {
    this.stopped = false;
    const generation = ++this.generation;
    if (initial) {
      this.sessionIdValue = initial.sessionId;
      this.lastSeq = initial.lastSeq;
      this.ackedSeq = initial.lastSeq;
      this.o.onSession(initial.sessionId, 'resumed');
    } else {
      await this.createSession('new');
      if (this.stopped || this.generation !== generation) return;
    }
    this.startStream();
  }

  stop(): void {
    this.stopped = true;
    this.generation++;
    clearTimeout(this.ackTimer);
    this.ackTimer = undefined;
    this.sse?.stop();
    this.sse = undefined;
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
    this.o.onOutgoing(id, 'sending');
    void this.deliver(entry);
    return id;
  }

  resend(id: string): void {
    const entry = this.outbox.get(id);
    if (!entry) return;
    this.o.onOutgoing(id, 'sending');
    void this.deliver(entry);
  }

  // ---- session ---------------------------------------------------------------------------

  private async createSession(kind: 'new'): Promise<void> {
    this.o.onConnection('connecting');
    for (let attempt = 0; !this.stopped; attempt++) {
      try {
        const res = await this.fetchImpl(`${this.base}/v1/session`, {
          method: 'POST',
          credentials: 'include',
        });
        if (res.status === 201) {
          const body = (await res.json()) as { sessionId?: unknown };
          if (typeof body.sessionId === 'string') {
            this.sessionIdValue = body.sessionId;
            this.lastSeq = 0;
            this.ackedSeq = 0;
            this.o.onSession(body.sessionId, kind);
            return;
          }
        }
      } catch {
        // network failure: retry below
      }
      this.o.onConnection('offline');
      await sleep(Math.min(30000, (this.o.retryBaseMs ?? 500) * 2 ** attempt));
    }
  }

  private resetSession(): Promise<void> {
    if (this.resetting) return this.resetting;
    this.sse?.stop();
    this.resetting = (async () => {
      try {
        // A fresh session that is rejected again must not turn into a hot loop.
        if (this.resetAttempts > 0) {
          await sleep(Math.min(30000, (this.o.retryBaseMs ?? 500) * 2 ** (this.resetAttempts - 1)));
        }
        this.resetAttempts++;
        if (this.stopped) return;
        await this.createSession('new');
        if (this.stopped) return;
        this.o.onSessionReset();
        this.startStream();
      } finally {
        this.resetting = undefined;
      }
    })();
    return this.resetting;
  }

  // ---- stream ----------------------------------------------------------------------------

  private startStream(): void {
    this.sse?.stop();
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
      onUnauthorized: () => void this.resetSession(),
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
    // Advance the cursor first: a throwing consumer must not cause an endless replay.
    if (event.seq > this.lastSeq) this.lastSeq = event.seq;
    try {
      this.o.onServerEvent(event);
    } catch {
      // consumer errors must not break the stream
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
    if (res.status === 401) return { kind: 'unauthorized' };
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
    const retryBase = this.o.retryBaseMs ?? 500;
    let attempts = 0;

    while (!this.stopped) {
      if (this.resetting) await this.resetting;
      if (this.stopped) return;
      attempts++;
      const result = await this.post(this.envelope(entry.id, entry.ts, entry.draft));

      switch (result.kind) {
        case 'ok':
          this.o.onOutgoing(entry.id, 'sent');
          return;
        case 'rejected':
          this.o.onOutgoing(entry.id, 'failed');
          return;
        case 'unauthorized':
          await this.resetSession();
          attempts--; // a session change is not the message's fault
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
      this.o.onOutgoing(entry.id, 'failed');
      return;
    }
  }
}
