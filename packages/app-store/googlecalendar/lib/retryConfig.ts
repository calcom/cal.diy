/**
 * Retry policy for the Google Calendar API client.
 *
 * gaxios (the HTTP client behind googleapis) retries only GET/HEAD/PUT/OPTIONS/DELETE
 * on 1xx/408/429/5xx by default (older releases skip 408). Creating an event does an
 * insert (POST) followed by a PATCH that adds the Meet link to the description/location,
 * and Google answers short bursts with `403 rateLimitExceeded`, which it documents as
 * retryable with exponential backoff:
 * https://developers.google.com/workspace/calendar/api/guides/errors
 * That PATCH was never retried, so the whole calendar integration failed and the booking
 * was left without calendar reference or confirmation emails (#28834, #30044).
 *
 * This policy keeps gaxios's defaults (3 retries, exponential backoff, same statuses)
 * and adds:
 * - PATCH, which Google Calendar applies idempotently. POST stays excluded so a retried
 *   insert can never create a duplicate event.
 * - 403 only when Google flags it as a rate limit (`rateLimitExceeded`,
 *   `userRateLimitExceeded`). Other 403s, such as missing permissions, still fail fast.
 */

const RETRYABLE_METHODS = new Set(["GET", "HEAD", "PUT", "OPTIONS", "DELETE", "PATCH"]);
const RATE_LIMIT_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded"]);
const DEFAULT_RETRY = 3;
const DEFAULT_NO_RESPONSE_RETRIES = 2;

type GoogleErrorBody = { error?: { errors?: Array<{ reason?: string }> } };

/** gaxios's default retryable statuses: 1xx, 408, 429 and 5xx. */
function isRetryableStatus(status: number): boolean {
  return status < 200 || status === 408 || status === 429 || status >= 500;
}

/** The subset of a GaxiosError this policy reads. */
export type RetryableError = {
  name?: string;
  /** node-fetch wraps the underlying error, e.g. an AbortError, here. */
  error?: { name?: string };
  config?: {
    method?: string;
    retryConfig?: {
      currentRetryAttempt?: number;
      retry?: number;
      noResponseRetries?: number;
    };
  };
  response?: {
    status?: number;
    data?: unknown;
  };
};

/** True for a 403 whose Google error reason is rateLimitExceeded or userRateLimitExceeded. */
export function isGoogleRateLimitError(err: RetryableError): boolean {
  if (err.response?.status !== 403) return false;
  let data = err.response.data;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return false;
    }
  }
  const errors = (data as GoogleErrorBody | null)?.error?.errors ?? [];
  return errors.some((e) => !!e?.reason && RATE_LIMIT_REASONS.has(e.reason));
}

/**
 * gaxios `shouldRetry` hook. It replaces gaxios's own predicate, so it re-implements the
 * default checks (abort, attempt budget, methods, statuses) and adds rate-limited 403s.
 */
export function shouldRetryGoogleCalendarRequest(err: RetryableError): boolean {
  const retryConfig = err.config?.retryConfig;
  if (!retryConfig || err.name === "AbortError" || err.error?.name === "AbortError") return false;

  const attempt = retryConfig.currentRetryAttempt ?? 0;
  if (attempt >= (retryConfig.retry ?? DEFAULT_RETRY)) return false;

  const method = err.config?.method?.toUpperCase();
  if (!method || !RETRYABLE_METHODS.has(method)) return false;

  // No response at all (ECONNRESET, ETIMEDOUT...): same budget as gaxios.
  if (!err.response) return attempt < (retryConfig.noResponseRetries ?? DEFAULT_NO_RESPONSE_RETRIES);

  const status = err.response.status;
  if (status === undefined) return false;
  return isRetryableStatus(status) || isGoogleRateLimitError(err);
}

/** googleapis-common deep-copies this into every request, so the attempt counter is per request. */
export function getGoogleCalendarRetryConfig(): {
  retry: number;
  shouldRetry: (err: RetryableError) => boolean;
} {
  return {
    retry: DEFAULT_RETRY,
    shouldRetry: shouldRetryGoogleCalendarRequest,
  };
}
