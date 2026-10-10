/** The chatbot answered with a non-2xx status. */
export class ChatbotHttpError extends Error {
  constructor(readonly status: number) {
    super(`Chatbot responded with HTTP ${status}`);
    this.name = 'ChatbotHttpError';
  }
}

/** The chatbot broke the NDJSON contract (invalid or oversized line). */
export class ChatbotProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatbotProtocolError';
  }
}
