/**
 * Normalizes a prefilled phone input value to international format.
 *
 * Prefills can arrive with formatting characters (spaces, parens, dashes)
 * from browser autofill or from values synced in after mount (e.g. phone
 * location auto-fill). This returns the sanitized value when it differs
 * from the input and is emittable, otherwise null (nothing to do).
 */
export function sanitizePhonePrefillValue(value: string): string | null {
  const sanitized = value
    .trim()
    .replace(/[^\d]/g, "")
    .replace(/^/, "+");

  if (sanitized === "+" || sanitized === "") return null;
  if (value === sanitized) return null;
  return sanitized;
}

/**
 * Decides whether a prefill value needs normalizing, given the value
 * already emitted for it.
 *
 * The guard must reset once the value no longer needs sanitizing: otherwise
 * a previously-seen dirty value supplied again later (form reset, undo,
 * re-sync from a dirty source) would be suppressed forever and the input
 * would stay unnormalized.
 */
export function resolvePrefillEmission(
  value: string,
  lastEmitted: string | undefined
): { sanitized: string | null; nextGuard: string | undefined } {
  const sanitized = sanitizePhonePrefillValue(value);
  if (sanitized == null) return { sanitized: null, nextGuard: undefined };
  if (lastEmitted === sanitized) return { sanitized: null, nextGuard: lastEmitted };
  return { sanitized, nextGuard: sanitized };
}
