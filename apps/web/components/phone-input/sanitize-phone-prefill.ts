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
    .replace(/[^\d+]/g, "")
    .replace(/^\+?/, "+");

  if (sanitized === "+" || sanitized === "") return null;
  if (value === sanitized) return null;
  return sanitized;
}
