/**
 * Splits OAuth scopes separated by space (OAuth standard RFC 6749) or comma (legacy Cal.com format).
 * Preserves unknown tokens without filtering them out, so server-side validation can reject them properly.
 */
export function parseOAuthScopes(scope?: string | null): string[] {
  if (!scope) return [];
  return scope
    .toString()
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
}
