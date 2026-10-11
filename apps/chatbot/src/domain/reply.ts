import type { UnsequencedServerEvent } from '@seguradora/protocol';

type Body<E> = E extends { type: infer T; payload: infer P } ? { type: T; payload: P } : never;

/**
 * The `type` and `payload` of any server event. The application layer adds the envelope
 * (`v`, `id`, `sessionId`, `correlationId`, `ts`).
 */
export type ReplyBody = Body<UnsequencedServerEvent>;
