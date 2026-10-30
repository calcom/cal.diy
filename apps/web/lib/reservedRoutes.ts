import { RESERVED_SUBDOMAINS } from "@calcom/lib/constants";

/**
 * Reserved routes that should NOT be treated as usernames on booking pages.
 *
 * These include:
 * 1. RESERVED_SUBDOMAINS from environment - org slugs, system routes
 * 2. Virtual routes - rewrites that don't have actual files
 * 3. Static booking page routes - to avoid unnecessary database lookups for non-user paths
 *
 * NOTE: While Next.js static routes have precedence over [user], we still keep them here
 * to avoid looking up users in the database for paths like /d/*, /booking/*, etc.
 * This is a performance optimization - these paths should never trigger a user locale lookup.
 */

// Static routes in app/(booking-page-wrapper)/ that should never be treated as usernames
// Even though Next.js routing precedence ensures they won't conflict, we keep them here
// to avoid unnecessary database queries in getLocale()
const STATIC_BOOKING_ROUTES = [
  "d", // /d/[link] - short link route
  "booking", // /booking/* - booking-related pages
  "booking-successful", // /booking-successful
  "org", // /org/[orgSlug]/[username] - organization-based booking pages
  "team", // /team/[teamSlug]/[username] - team-based booking pages
] as const;

// Virtual routes that don't have files but work via rewrites/special handling
const VIRTUAL_ROUTES = [
  "forms", // routing forms virtual path
  "router", // router virtual path
  "success", // booking success virtual path
] as const;

/**
 * Get complete list of reserved routes that should not be treated as usernames.
 *
 * This combines:
 * - RESERVED_SUBDOMAINS from environment variable (org slugs, system routes, etc.)
 * - Static booking page routes (optimization to avoid DB lookups)
 * - Virtual routes (rewrites that don't have actual files)
 */
export function getReservedRoutes(): readonly string[] {
  return [
    ...RESERVED_SUBDOMAINS, // Loaded from environment at runtime
    ...STATIC_BOOKING_ROUTES,
    ...VIRTUAL_ROUTES,
  ];
}

// Cache reserved routes in a Set for O(1) lookup performance
// RESERVED_SUBDOMAINS is loaded from env at module load time and doesn't change
const RESERVED_ROUTES_CACHE = new Set(getReservedRoutes());

/**
 * Check if a route segment is a reserved route that should not be treated as a username.
 * Uses cached Set for O(1) lookup performance.
 */
export function isReservedRoute(segment: string): boolean {
  return RESERVED_ROUTES_CACHE.has(segment);
}
