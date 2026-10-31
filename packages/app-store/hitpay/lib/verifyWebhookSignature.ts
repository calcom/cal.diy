import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Builds the HMAC-SHA256 signature HitPay expects for a webhook payload: every field except
 * `hmac`, sorted by key, concatenated as `keyvalue`, then signed with the account's salt key.
 *
 * @see https://docs.hit-pay.com/api/webhooks
 */
export function generateWebhookSignature(saltKey: string, payload: Record<string, string>): string {
  // The exclusion belongs here rather than in the caller: a caller that hands over the payload
  // as received, `hmac` included, would otherwise sign a different string and reject a valid
  // webhook.
  const source = Object.keys(payload)
    .filter((key) => key !== "hmac")
    .sort()
    .map((key) => `${key}${payload[key]}`)
    .join("");

  return createHmac("sha256", saltKey).update(source, "utf-8").digest("hex");
}

/**
 * Compares the signature sent by HitPay against the one computed locally.
 *
 * The comparison is constant-time: a plain `===` on the two hex strings returns as soon as the
 * first byte differs, which leaks how much of a guessed signature was correct and lets a caller
 * recover a valid one byte by byte. `timingSafeEqual` requires equal lengths, so a length
 * mismatch is rejected first — the length of a SHA-256 hex digest is fixed and public.
 */
export function isValidWebhookSignature(
  saltKey: string,
  payload: Record<string, string>,
  receivedSignature: unknown
): boolean {
  if (typeof receivedSignature !== "string") {
    return false;
  }

  const expected = Buffer.from(generateWebhookSignature(saltKey, payload));
  const received = Buffer.from(receivedSignature);

  return expected.length === received.length && timingSafeEqual(expected, received);
}
