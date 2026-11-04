import { useCompatSearchParams } from "@calcom/lib/hooks/useCompatSearchParams";
import { type ReadonlyURLSearchParams, usePathname } from "next/navigation";

const reservedRootPaths: Set<string> = new Set([
  "api",
  "auth",
  "apps",
  "availability",
  "enterprise",
  "event-types",
  "getting-started",
  "maintenance",
  "more",
  "onboarding",
  "payment",
  "refer",
  "settings",
  "signup",
  "upgrade",
  "video",
  "icons",
  "e2e",
  "reschedule",
  "_next",
  "_static",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "manifest.json",
]);

const bookingPagePrefixes = [
  "/booking",
  "/cancel",
  "/reschedule",
  "/instant-meeting",
  "/team",
  "/d",
  "/router",
] as const;

const bookingsListSuffixes = ["/upcoming", "/unconfirmed", "/recurring", "/cancelled", "/past"] as const;

export function isBookingPagePath(
  pathname?: string | null,
  searchParams?: ReadonlyURLSearchParams | null
): boolean {
  const normalizedPathname = (pathname ?? "").trim();
  const lowerPathname = normalizedPathname.toLowerCase();

  const isUserBookingPage = Boolean(searchParams?.get("user"));
  const isUserBookingTypePage = isUserBookingPage && Boolean(searchParams?.get("type"));
  if (isUserBookingPage || isUserBookingTypePage) {
    return true;
  }

  const isBookingsListPage = bookingsListSuffixes.some((route) => lowerPathname.endsWith(route));
  const isKnownBookingPage = bookingPagePrefixes.some((route) => lowerPathname.startsWith(route));

  if (isKnownBookingPage) {
    return !isBookingsListPage;
  }

  if (isBookingsListPage) {
    return false;
  }

  const pathSegment = lowerPathname.split("/")[1] ?? lowerPathname.split("/")[0];
  return Boolean(pathSegment) && !reservedRootPaths.has(pathSegment);
}

export default function useIsBookingPage(): boolean {
  const pathname = usePathname();
  const searchParams = useCompatSearchParams();

  return isBookingPagePath(pathname, searchParams);
}
