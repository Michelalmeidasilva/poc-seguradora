import { z } from 'zod';
import { ERROR_CODES, LIMITS } from './limits';

/** Only http(s) URLs: blocks javascript:, data:, vbscript: and similar schemes. Never throws. */
export const httpUrl = z.string().refine((value) => {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}, 'must be an http(s) URL');

const buttonTitle = z.string().min(1).max(LIMITS.maxQuickReplyTitle);

export const ButtonSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('quick_reply'), id: z.string().min(1), title: buttonTitle }),
  z.object({ type: z.literal('url'), title: buttonTitle, url: httpUrl }),
  z.object({ type: z.literal('phone'), title: buttonTitle, phone: z.string().min(3) }),
]);

export const TextPayload = z.object({ text: z.string().min(1).max(LIMITS.maxTextLength) });

export const VoicePayload = z.object({
  mediaUrl: httpUrl,
  durationMs: z.number().int().positive(),
  transcript: z.string().optional(),
});

export const CodePayload = z.object({
  language: z.string().min(1).optional(),
  code: z.string().min(1).max(LIMITS.maxCodeLength),
});

export const LocationPayload = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  name: z.string().optional(),
  address: z.string().optional(),
});

export const TemplatePayload = z.object({
  header: z.string().max(60).optional(),
  body: z.string().min(1).max(1024),
  footer: z.string().max(60).optional(),
  buttons: z.array(ButtonSchema).max(LIMITS.maxButtonsPerMessage),
});

export const CarouselCardSchema = z.object({
  mediaUrl: httpUrl,
  mediaType: z.enum(['image', 'video']),
  title: z.string().min(1).max(60),
  body: z.string().max(160).optional(),
  buttons: z.array(ButtonSchema).max(LIMITS.maxButtonsPerCard),
});

export const CarouselPayload = z.object({
  cards: z.array(CarouselCardSchema).min(LIMITS.minCarouselCards).max(LIMITS.maxCarouselCards),
});

export const QuickRepliesPayload = z.object({
  text: z.string().min(1).max(LIMITS.maxTextLength),
  options: z
    .array(z.object({ id: z.string().min(1), title: buttonTitle }))
    .min(1)
    .max(LIMITS.maxQuickReplyOptions),
});

// flowJson is a generic record until Plan 5 refines it with the Flow JSON schema.
export const FlowPayload = z.object({
  flowId: z.string().min(1),
  header: z.string().max(60).optional(),
  body: z.string().min(1).max(1024),
  footer: z.string().max(60).optional(),
  ctaLabel: z.string().min(1).max(20),
  flowJson: z.record(z.string(), z.unknown()),
});

export const TypingPayload = z.object({ state: z.enum(['start', 'stop']) });
export const DeliveredPayload = z.object({ messageId: z.string().min(1) });
export const ReadPayload = z.object({ messageId: z.string().min(1) });
export const ErrorPayload = z.object({
  code: z.enum(ERROR_CODES),
  message: z.string().min(1),
  /** The client message (id) that failed, when the error relates to one. */
  messageId: z.string().min(1).optional(),
  retryAfterMs: z.number().int().nonnegative().optional(),
});
