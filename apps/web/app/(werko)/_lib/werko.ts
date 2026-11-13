// Werk|0 website; the portal's header, footer and breadcrumbs link back to it
export const WERKO_WEB_URL = process.env.NEXT_PUBLIC_WERKO_WEB_URL ?? "https://werko.cz";

export const werkoWebPath = (path = "") => `${WERKO_WEB_URL}/cs${path}`;

export const TIME_ZONE = "Europe/Prague";
export const LOCALE = "cs";

// Matches the rooms' availability schedule (Mon–Fri 8–18)
export const OPENING_HOURS = { from: 8, to: 18 };

// Event type every room uses for the wizard: hourly base with multipleDuration 1–10 h
export const BOOKING_EVENT_SLUG = "rezervace";

export type SpaceSlug = "cowork" | "zasedacka" | "kancelar" | "podcast";

/**
 * Spaces in the order of the design. Each space is a Cal.diy user named after its slug.
 * Hourly rates are placeholders until the price list is decided (meeting room matches the design: 2 h = 1 000 Kč).
 */
export const SPACES: { slug: SpaceSlug; image: string; pricePerHour: number }[] = [
  { slug: "cowork", image: "/werko/spaces/cowork.jpg", pricePerHour: 150 },
  { slug: "zasedacka", image: "/werko/spaces/meeting-rooms.jpg", pricePerHour: 500 },
  { slug: "kancelar", image: "/werko/spaces/offices.jpg", pricePerHour: 400 },
  { slug: "podcast", image: "/werko/spaces/podcast.jpg", pricePerHour: 600 },
];

export const formatPrice = (amount: number) =>
  new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(
    amount
  );
