export const DEFAULT_CONFERENCING_REDIRECT_URL = "/apps/installed/conferencing";

/**
 * OAuth callback state is caller-supplied and unsigned at this endpoint, so
 * redirect targets taken from it (onErrorReturnTo / returnTo) must never be
 * trusted as-is (CVE-2026-63768). Only relative paths and absolute URLs on the
 * web app origin are allowed; everything else falls back to the installed
 * conferencing page.
 */
export function getSafeConferencingRedirectUrl(url: string | undefined): string {
  if (!url) {
    return DEFAULT_CONFERENCING_REDIRECT_URL;
  }

  // Relative paths stay on the current origin; "//host" is protocol-relative and must be rejected
  if (url.startsWith("/") && !url.startsWith("//")) {
    return url;
  }

  try {
    const parsedUrl = new URL(url);
    const webappUrl = new URL(process.env.NEXT_PUBLIC_WEBAPP_URL ?? "https://cal.com");
    if (parsedUrl.origin === webappUrl.origin) {
      return url;
    }
  } catch {
    // fall through to the default redirect
  }

  return DEFAULT_CONFERENCING_REDIRECT_URL;
}
