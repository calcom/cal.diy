import { parse } from "accept-language-parser";
import { lookup } from "bcp-47-match";
import type { GetTokenParams } from "next-auth/jwt";
import { getToken } from "next-auth/jwt";

import { i18n } from "@calcom/i18n/next-i18next.config";

type ReadonlyHeaders = Awaited<ReturnType<typeof import("next/headers").headers>>;
type ReadonlyRequestCookies = Awaited<ReturnType<typeof import("next/headers").cookies>>;

/**
 * This is a slimmed down version of the `getServerSession` function from
 * `next-auth`.
 *
 * Instead of requiring the entire options object for NextAuth, we create
 * a compatible session using information from the incoming token.
 *
 * The downside to this is that we won't refresh sessions if the users
 * token has expired (30 days). This should be fine as we call `/auth/session`
 * frequently enough on the client-side to keep the session alive.
 */
export const getLocale = async (
  req:
    | GetTokenParams["req"]
    | {
        cookies: ReadonlyRequestCookies;
        headers: ReadonlyHeaders;
      },
  username?: string
): Promise<string> => {
  // IMPORTANT: For booking pages, the page OWNER's locale takes precedence over the visitor's locale
  // If username is provided (from pathname), fetch the page owner's locale first
  if (username) {
    // Validate username format before database query
    // Valid usernames follow slugify rules: lowercase alphanumeric + periods + hyphens
    // Cannot start with dash/period or end with dash/period, max 255 chars (DB limit)
    const isValidUsername =
      /^[a-z0-9][a-z0-9.-]{0,253}[a-z0-9]$/.test(username) || /^[a-z0-9]$/.test(username);

    if (!isValidUsername) {
      // Invalid username format - skip DB lookup and fall back to token/browser locale
      console.warn("[getLocale] Invalid username format");
    } else if (typeof window === "undefined") {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod = (await import("@calcom/prisma")) as any;
        const serverPrisma = mod.prisma ?? mod.default;

        const user = await serverPrisma.user.findFirst({
          where: { username, locked: false },
          select: { locale: true },
        });

        if (user) {
          // User found - return their locale or default to "en" if null
          return user.locale || "en";
        }
      } catch (error) {
        // Silently fail and fallback to token/browser locale
        // Log only the error message to avoid exposing PII from the query context
        console.error(
          "[getLocale] Failed to fetch user locale:",
          error instanceof Error ? error.message : "Unknown error"
        );
      }
    }
  }

  // Fallback to authenticated user's token locale (for non-booking pages or when page owner not found)
  const token = await getToken({
    req: req as GetTokenParams["req"],
  });

  const tokenLocale = token?.["locale"];

  if (tokenLocale) {
    return tokenLocale;
  }

  // Final fallback: use Accept-Language header from browser
  const acceptLanguage =
    req.headers instanceof Headers ? req.headers.get("accept-language") : req.headers["accept-language"];

  const languages = acceptLanguage ? parse(acceptLanguage) : [];

  const code: string = languages[0]?.code ?? "";
  const region: string = languages[0]?.region ?? "";

  // the code should consist of 2 or 3 lowercase letters
  // the regex underneath is more permissive
  const testedCode = /^[a-zA-Z]+$/.test(code) ? code : "en";

  // the code should consist of either 2 uppercase letters or 3 digits
  // the regex underneath is more permissive
  const testedRegion = /^[a-zA-Z0-9]+$/.test(region) ? region : "";

  const requestedLocale = `${testedCode}${testedRegion !== "" ? "-" : ""}${testedRegion}`;

  // use fallback to closest supported locale.
  // for instance, es-419 will be transformed to es
  return lookup(i18n.locales, requestedLocale) ?? requestedLocale;
};
