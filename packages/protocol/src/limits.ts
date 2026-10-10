export const LIMITS = {
  maxTextLength: 4096,
  maxCodeLength: 8192,
  maxQuickReplyOptions: 3,
  maxQuickReplyTitle: 20,
  maxButtonsPerMessage: 3,
  maxButtonsPerCard: 2,
  minCarouselCards: 2,
  maxCarouselCards: 10,
  /** Max serialized size of a client event; the gateway enforces it as `payload_too_large`. */
  maxEventBytes: 65536,
} as const;

export const ERROR_CODES = [
  'rate_limited',
  'invalid_schema',
  'upstream_unavailable',
  'unauthorized',
  'payload_too_large',
  'internal_error',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
