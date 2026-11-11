/**
 * Wraps `fetch` with a timeout and combines caller-provided AbortSignals.
 *
 * Ensures that if the caller passes their own `options.signal` (e.g. from an HTTP request or user cancellation),
 * the request is aborted if EITHER the timeout expires OR the external signal is aborted.
 * The timer and the listener on the caller's signal are both released once the request settles.
 *
 * @param url - The URL, URL object, or Request object to fetch.
 * @param options - Standard fetch RequestInit options, including headers, method, body, and optional `signal`.
 * @param timeoutMs - The timeout in milliseconds after which the request is aborted.
 * @returns A promise that resolves to the Response object.
 *
 * @example
 * ```ts
 * const res = await fetchWithTimeout("https://api.example.com/data", {}, 5000);
 *
 * // Combined with caller's own cancellation signal
 * const controller = new AbortController();
 * const res = await fetchWithTimeout(
 *   "https://api.example.com/data",
 *   { signal: controller.signal },
 *   10000
 * );
 * ```
 */
export async function fetchWithTimeout(
  url: string | URL | Request,
  options: RequestInit = {},
  timeoutMs: number = 5000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // A caller that abandons the promise never reaches the `finally` below, and the pending timer
  // would hold the Node event loop open for the rest of the timeout.
  if (typeof timer.unref === "function") {
    timer.unref();
  }

  const externalSignal = options.signal;
  const forwardExternalAbort = () => controller.abort(externalSignal?.reason);

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener("abort", forwardExternalAbort, { once: true });
    }
  }

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    // `{ once: true }` only detaches after the event fires, so a request that completes normally
    // would otherwise leave this listener on a caller signal that may outlive many requests.
    externalSignal?.removeEventListener("abort", forwardExternalAbort);
  }
}
