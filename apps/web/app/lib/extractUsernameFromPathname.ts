import { isReservedRoute } from "@lib/reservedRoutes";

/**
 * Extracts the username from a pathname for booking page locale detection.
 * Handles various URL patterns including org-based routes.
 *
 * Note: Team routes (/team/[slug]/[type]) don't have individual usernames,
 * so they are not extracted here. Only org routes (/org/[orgSlug]/[username])
 * and direct user routes (/[username]) are handled.
 */
export function extractUsernameFromPathname(pathname: string): string | undefined {
  if (!pathname) return undefined;

  const pathSegments = pathname.split("/").filter(Boolean);

  if (pathSegments.length === 0) return undefined;

  const firstSegment = pathSegments[0];

  // For /[username] and /[username]/[type]
  // Don't treat reserved routes as usernames
  if (!isReservedRoute(firstSegment)) {
    return firstSegment;
  }

  // For /org/[orgSlug]/[username] - org is reserved, so we need special handling
  // to extract the username at position [2]
  if (firstSegment === "org" && pathSegments.length > 2) {
    const potentialUsername = pathSegments[2];
    if (!isReservedRoute(potentialUsername)) {
      return potentialUsername;
    }
  }

  // Note: /team/[slug]/[type] routes don't have usernames - [type] is an event type
  // Team locale should be handled differently (e.g., by team settings)
  // TODO: Team locale detection is not yet implemented. Team booking pages will fall back
  // to the visitor's locale. Future work: extract team slug and look up team locale settings.

  return undefined;
}
