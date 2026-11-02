import process from "node:process";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, getRequestHeaders } from "@tanstack/react-start/server";
import { hour12FromTimeFormat } from "~/lib/date-utils";
import { DEFAULT_LOCALE, localeFromAcceptLanguage, matchLocale } from "~/lib/locales";
import { type ThemePreference, toThemePreference } from "~/lib/theme";
import { weekStartIndex } from "~/lib/time-format";
import { isEmailEnabled } from "../emails/container";
import { getAuth } from "./auth";

export type SessionUser = {
  id: number;
  email: string;
  name: string | null;
  username: string | null;
  timeZone: string;
  /** Hour cycle for this user's own views: true = 12-hour, false = 24-hour, undefined = the locale's. */
  hour12: boolean | undefined;
  /** 0 = Sunday. */
  weekStartDay: number;
  appTheme: ThemePreference;
  /** Unverified, and this instance can actually send the verification email. */
  needsEmailVerification: boolean;
  isAdmin: boolean;
  twoFactorEnabled: boolean;
  /** Set while an admin is signed in as this user. */
  impersonatedBy: number | null;
  /** New sign-ups go through /getting-started first, as in Cal. */
  completedOnboarding: boolean;
};

export type RequestContext = {
  user: SessionUser | null;
  locale: string;
  /** Public origin for links people share (booking pages); behind a proxy the request URL may be internal. */
  origin: string;
};

/** One session lookup per navigation; the result is shared with every route through router context. */
export const getRequestContext = createServerFn({ method: "GET" }).handler(
  async (): Promise<RequestContext> => {
    const headers = getRequestHeaders();
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers });
    const user = session
      ? {
          id: Number(session.user.id),
          email: session.user.email,
          name: session.user.name || null,
          username: session.user.username ?? null,
          timeZone: session.user.timeZone ?? "Europe/London",
          hour12: hour12FromTimeFormat(session.user.timeFormat),
          weekStartDay: weekStartIndex(session.user.weekStart),
          appTheme: toThemePreference(session.user.appTheme),
          needsEmailVerification: !session.user.emailVerified && isEmailEnabled(),
          isAdmin: session.user.role === "ADMIN",
          twoFactorEnabled: session.user.twoFactorEnabled === true,
          impersonatedBy: session.session.impersonatedBy ? Number(session.session.impersonatedBy) : null,
          completedOnboarding: session.user.completedOnboarding !== false,
        }
      : null;
    const userLocale = session?.user.locale ? matchLocale(session.user.locale) : null;
    const locale = userLocale ?? localeFromAcceptLanguage(headers.get("accept-language")) ?? DEFAULT_LOCALE;
    const origin = process.env.BETTER_AUTH_URL ?? new URL(getRequest().url).origin;
    return { user, locale, origin: origin.replace(/\/+$/, "") };
  }
);
