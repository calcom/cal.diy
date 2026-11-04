// Kept free of server-only imports so the Booker UI can share the same limits.
export const BOOKING_ASSISTANT_LIMITS = {
  maxQueryLength: 200,
  maxSuggestions: 3,
  maxDaysAhead: 90,
  // Bounds slot-engine work per request to about one month, however broad the booker's request is.
  maxRangeDays: 31,
  // Reasoning models took up to ~4.5 s in live tests, so 5 s cut off valid answers.
  requestTimeoutMs: 8000,
  // The JSON answer is under 100 tokens, but hidden reasoning counts against this limit too (up to ~500
  // tokens in live tests). At 300, reasoning used the whole budget and the answer came back empty.
  maxOutputTokens: 1500,
  // A normal provider response is about 1-2 KB, so anything far larger is not a usable answer.
  maxResponseBytes: 16_384,
} as const;
