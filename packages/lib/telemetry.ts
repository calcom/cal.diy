import process from "node:process";
import type { NextApiRequest, NextApiResponse } from "next";
// Importing types so we're not directly importing next/server
import type { NextRequest, NextResponse } from "next/server";

export const telemetryEventTypes = {
  pageView: "page_view",
  apiCall: "api_call",
  bookingConfirmed: "booking_confirmed",
  bookingCancelled: "booking_cancelled",
  importSubmitted: "import_submitted",
  login: "login",
  embedView: "embed_view",
  embedBookingConfirmed: "embed_booking_confirmed",
  onboardingFinished: "onboarding_finished",
  onboardingStarted: "onboarding_started",
  signup: "signup",
  team_checkout_session_created: "team_checkout_session_created",
  team_created: "team_created",
  slugReplacementAction: "slug_replacement_action",
  org_created: "org_created",
  license_key_created: "license_key_created",
};

export function collectPageParameters(
  route?: string,
  extraData: Record<string, unknown> = {}
): Record<string, unknown> {
  const host = document.location.host;
  const docPath = route ?? "";
  return {
    page_url: route,
    doc_encoding: document.characterSet,
    url: `${document.location.protocol}//${host}${docPath ?? ""}`,
    ...extraData,
  };
}

export const nextCollectBasicSettings: CollectOpts = {
  drivers: [
    process.env.CALCOM_TELEMETRY_DISABLED === "1" || process.env.NEXT_PUBLIC_IS_E2E === "1"
      ? undefined
      : {
          type: "jitsu",
          opts: {
            key: "s2s.2pvs2bbpqq1zxna97wcml.esb6cikfrf7yn0qoh1nj1",
            server: "https://t.calendso.com",
          },
        },
    process.env.TELEMETRY_DEBUG && { type: "echo", opts: { disableColor: true } },
  ],
  eventTypes: [
    { "*.ttf": null },
    { "*.webmanifest": null },
    { "*.json": null },
    { "*.svg": null },
    { "*.map": null },
    { "*.png": null },
    { "*.gif": null },
    { "/api/collect-events": null },
    { "/api*": null },
    { "/img*": null },
    { "/favicon*": null },
    { "/*": telemetryEventTypes.pageView },
  ],
};

export const extendEventData = (
  req: NextRequest | NextApiRequest,
  res: NextResponse | NextApiResponse,
  original: { page_url: string; isTeamBooking: boolean }
) => {
  const onVercel =
    typeof req.headers?.get === "function"
      ? !!req.headers.get("x-vercel-id")
      : !!(req.headers as { [key: string]: string })?.["x-vercel-id"];
  const pageUrl = original?.page_url || req.url || undefined;
  const cookies = req.cookies as { [key: string]: string };
  return {
    title: "",
    ipAddress: "",
    queryString: "",
    page_url: pageUrl,
    isTeamBooking:
      original?.isTeamBooking === undefined
        ? pageUrl?.includes("team/") || undefined
        : original?.isTeamBooking,
    referrer: "",
    onVercel,
    isAuthorized: !!cookies["next-auth.session-token"] || !!cookies["__Secure-next-auth.session-token"],
    utc_time: new Date().toISOString(),
  };
};
