import type { ChatbotRequest, UnsequencedServerEvent } from '@seguradora/protocol';
import { ChatbotHttpError, ChatbotProtocolError } from '../application/errors';
import type { ChatbotPort } from '../application/ports';
import { parseNdjson } from './ndjson';

export interface HttpChatbotClientOptions {
  baseUrl: string;
  /** Result of `createChatbotPolicy`: wraps the connection attempt only. */
  policy: <T>(fn: (signal: AbortSignal) => Promise<T>) => Promise<T>;
  /** Upper bound for the whole turn, including reading the reply stream. */
  turnTimeoutMs: number;
  fetchImpl?: typeof fetch;
}

export class HttpChatbotClient implements ChatbotPort {
  private readonly fetchImpl: typeof fetch;
  private readonly url: string;

  constructor(private readonly o: HttpChatbotClientOptions) {
    this.fetchImpl = o.fetchImpl ?? fetch;
    this.url = new URL('/v1/chat/events', o.baseUrl).toString();
  }

  async send(request: ChatbotRequest): Promise<AsyncIterable<UnsequencedServerEvent>> {
    const response = await this.o.policy(async (signal) => {
      const res = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/x-ndjson',
          'x-correlation-id': request.correlationId,
        },
        body: JSON.stringify(request),
        signal: AbortSignal.any([signal, AbortSignal.timeout(this.o.turnTimeoutMs)]),
      });
      if (!res.ok) {
        // Best effort: free the connection; the status error is what matters.
        void res.body?.cancel().catch(() => undefined);
        throw new ChatbotHttpError(res.status);
      }
      return res;
    });

    if (!response.body) throw new ChatbotProtocolError('chatbot response has no body');
    return parseNdjson(response.body);
  }
}
