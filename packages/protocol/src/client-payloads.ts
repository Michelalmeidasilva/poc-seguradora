import { z } from 'zod';
import { LIMITS } from './limits';

// Client payloads are strict: unknown fields are rejected, never silently dropped.
export const UserTextPayload = z
  .object({ text: z.string().trim().min(1).max(LIMITS.maxTextLength) })
  .strict();

export const UserVoicePayload = z
  .object({ mediaId: z.string().min(1), durationMs: z.number().int().positive() })
  .strict();

export const UserQuickReplyPayload = z
  .object({ optionId: z.string().min(1), replyToId: z.string().min(1) })
  .strict();

export const UserFlowSubmitPayload = z
  .object({ flowId: z.string().min(1), data: z.record(z.string(), z.unknown()) })
  .strict();

export const UserFlowDataExchangePayload = z
  .object({
    flowId: z.string().min(1),
    screen: z.string().min(1),
    action: z.string().min(1),
    data: z.record(z.string(), z.unknown()),
  })
  .strict();

export const UserTypingPayload = z.object({ state: z.enum(['start', 'stop']) }).strict();

export const UserAckPayload = z
  .object({ lastSeq: z.number().int().nonnegative() })
  .strict();
