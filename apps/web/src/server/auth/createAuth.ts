import "@tanstack/react-start/server-only";

import { apiKey } from "@better-auth/api-key";
import type { Database } from "@calcom/db/database";
import {
  account,
  apiKey as apiKeyTable,
  membership,
  session,
  teamInvitation,
  twoFactor as twoFactorTable,
  user,
  verification,
} from "@calcom/db/schema";
import { isPasswordValid } from "@calcom/lib/auth/isPasswordValid";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin } from "better-auth/plugins/admin";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { twoFactor } from "better-auth/plugins/two-factor";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { MIN_PASSWORD_LENGTH } from "~/lib/auth-errors";
import { OIDC_PROVIDER_ID } from "~/lib/oidc";
import { RESERVED_USERNAMES } from "~/lib/reserved-usernames";
import { pickMessages } from "../catalog";
import type { AuthEmailKind } from "../emails/templates";
import { EventTypeRepository } from "../event-types/EventTypeRepository";
import { EventTypeService } from "../event-types/EventTypeService";
import { ScheduleRepository } from "../schedules/ScheduleRepository";
import { ScheduleService } from "../schedules/ScheduleService";
import { UserRepository } from "../users/UserRepository";
import { createPasswordVerifier } from "./legacyPassword";
import type { OidcConfig } from "./oidc";
import { teamsAuthSchema, teamsPlugin } from "./organizations";
import { findAvailableUsername, normalizeUsername, usernameFromEmail } from "./username";

const DEFAULT_TIME_ZONE = "Europe/London";

// The time zone comes from the browser at signup; anything that isn't a real IANA zone would break
// every availability calculation for this user later.
function validTimeZone(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return null;
  }
}

// Every endpoint that sets a password must apply Cal's rule, not just sign-up.
const PASSWORD_FIELD_BY_PATH: Record<string, string> = {
  "/sign-up/email": "password",
  "/reset-password": "newPassword",
  "/change-password": "newPassword",
};

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function authEmailRecipient(target: { email: string; name?: string | null; locale?: unknown }) {
  return {
    email: target.email,
    name: target.name ?? null,
    locale: typeof target.locale === "string" ? target.locale : null,
  };
}

/** New users get a username, a valid time zone, and Cal's default schedule and event types. */
type UserCreateHooks = NonNullable<
  NonNullable<NonNullable<BetterAuthOptions["databaseHooks"]>["user"]>["create"]
>;

function userCreateHooks(
  users: UserRepository,
  schedules: ScheduleService,
  eventTypes: EventTypeService
): UserCreateHooks {
  return {
    before: async (newUser) => {
      const timeZone = validTimeZone(newUser.timeZone) ?? DEFAULT_TIME_ZONE;
      // Cal's self-host setup makes whoever creates the first account the instance admin.
      const role = (await users.hasAny()) ? "USER" : "ADMIN";
      const requested = typeof newUser.username === "string" ? normalizeUsername(newUser.username) : "";
      if (requested) {
        const username = requested;
        const taken = await users.findTakenUsernamesWithoutOrganization([username]);
        if (taken.has(username) || RESERVED_USERNAMES.has(username)) {
          throw new APIError("BAD_REQUEST", {
            message: AUTH_ERROR_CODES.usernameTaken,
            code: AUTH_ERROR_CODES.usernameTaken,
          });
        }
        return { data: { ...newUser, username, timeZone, role } };
      }
      // OAuth sign-ups have no username field, and every user needs one for their booking links.
      return {
        data: {
          ...newUser,
          role,
          username: await findAvailableUsername(users, usernameFromEmail(newUser.email)),
        },
      };
    },
    // A schedule and two event types, as Cal's onboarding sets up, so the booking page works right away.
    after: async (createdUser) => {
      const userId = Number(createdUser.id);
      const messages = await pickMessages("en", ["default_schedule_name", "15min_meeting", "30min_meeting"]);
      await schedules.createDefault(
        userId,
        validTimeZone(createdUser.timeZone) ?? DEFAULT_TIME_ZONE,
        messages.default_schedule_name ?? "Working hours"
      );
      await eventTypes.createDefaults(userId, {
        fifteen: messages["15min_meeting"] ?? "15 min meeting",
        thirty: messages["30min_meeting"] ?? "30 min meeting",
      });
    },
  };
}

/**
 * Applies Cal's password rule everywhere a password is set, and (in production) keeps admins
 * without two-factor authentication out of admin endpoints, as Cal does.
 */
function beforeHook(requireAdminTwoFactor: boolean) {
  return createAuthMiddleware(async (ctx) => {
    if (requireAdminTwoFactor && ctx.path.startsWith("/admin/") && ctx.path !== "/admin/stop-impersonating") {
      const token = await ctx.getSignedCookie(ctx.context.authCookies.sessionToken.name, ctx.context.secret);
      const current = token ? await ctx.context.internalAdapter.findSession(token) : null;
      if (current && !current.user.twoFactorEnabled)
        throw new APIError("FORBIDDEN", {
          message: AUTH_ERROR_CODES.adminNeedsTwoFactor,
          code: AUTH_ERROR_CODES.adminNeedsTwoFactor,
        });
    }
    const field = PASSWORD_FIELD_BY_PATH[ctx.path];
    if (!field) return;
    const password: unknown = ctx.body?.[field];
    // Same rule as the old signup flow; Better Auth only checks length.
    if (typeof password !== "string" || !isPasswordValid(password)) {
      throw new APIError("BAD_REQUEST", {
        message: AUTH_ERROR_CODES.invalidPassword,
        code: AUTH_ERROR_CODES.invalidPassword,
      });
    }
  });
}

/** Better Auth's admin plugin on Cal's columns. */
function adminPlugin() {
  return admin({
    // Cal's UserPermissionRole values.
    defaultRole: "USER",
    adminRoles: ["ADMIN"],
    roles: { ADMIN: adminAc, USER: userAc },
    // Cal's `locked` users can't sign in, which is what the plugin's ban does.
    schema: { user: { fields: { banned: "locked" } } },
    bannedUserMessage: AUTH_ERROR_CODES.userLocked,
  });
}

export type AuthConfig = {
  db: Database;
  baseURL: string;
  secret: string;
  google?: { clientId: string; clientSecret: string };
  /** Single sign-on through the instance's own OpenID Connect provider. */
  oidc?: OidcConfig;
  /** Headers the runtime guarantees hold the real client IP; rate limiting is keyed on it. */
  clientIpHeaders: string[];
  rateLimit: boolean;
  /** Sends reset and verification links; null when no email provider is configured. */
  sendAuthEmail: AuthEmailSender | null;
  /** Cal only lets admins with two-factor authentication act as admins in production. */
  requireAdminTwoFactor?: boolean;
};

export type AuthEmailSender = (
  kind: AuthEmailKind,
  recipient: { email: string; name: string | null; locale: string | null },
  url: string,
  values?: Record<string, string>
) => Promise<void>;

// Error codes are i18n keys from packages/i18n/locales/en/common.json; the client translates them.
export const AUTH_ERROR_CODES = {
  invalidPassword: "invalid_password_hint",
  usernameTaken: "username_already_taken",
  userLocked: "your_account_is_locked",
  adminNeedsTwoFactor: "admin_needs_two_factor",
} as const;

export function createAuth({
  db,
  baseURL,
  secret,
  google,
  oidc,
  clientIpHeaders,
  rateLimit,
  sendAuthEmail,
  requireAdminTwoFactor = false,
}: AuthConfig) {
  const users = new UserRepository(db);
  const scheduleRepo = new ScheduleRepository(db);
  const schedules = new ScheduleService({ scheduleRepo, userRepo: users });
  const eventTypes = new EventTypeService({ eventTypeRepo: new EventTypeRepository(db), scheduleRepo });

  return betterAuth({
    appName: "Cal.diy",
    baseURL,
    secret,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user,
        session,
        account,
        verification,
        twoFactor: twoFactorTable,
        apikey: apiKeyTable,
        membership,
        teamInvitation,
        ...teamsAuthSchema,
      },
    }),
    advanced: {
      // Cal's users.id (and every foreign key to it) is an integer, so all auth ids are serial too.
      database: { generateId: "serial" },
      cookiePrefix: "cal",
      // Without a trustworthy IP, Better Auth puts every client in one rate-limit bucket, so a few
      // failed sign-ins anywhere would lock everyone out.
      ipAddress: { ipAddressHeaders: clientIpHeaders },
    },
    // Better Auth's own default reads NODE_ENV, which Workers don't set, so it would stay off there.
    rateLimit: { enabled: rateLimit },
    user: {
      fields: { image: "avatarUrl", createdAt: "createdDate" },
      additionalFields: {
        username: { type: "string", required: false, input: true },
        timeZone: { type: "string", required: false, input: true },
        locale: { type: "string", required: false, input: false },
        timeFormat: { type: "number", required: false, input: false },
        weekStart: { type: "string", required: false, input: false },
        appTheme: { type: "string", required: false, input: false },
        completedOnboarding: { type: "boolean", required: false, input: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      revokeSessionsOnPasswordReset: true,
      password: {
        verify: createPasswordVerifier((oldHash, newHash) => users.replacePasswordHash(oldHash, newHash)),
      },
      sendResetPassword: sendAuthEmail
        ? async ({ user: target, url }) => {
            await sendAuthEmail("reset_password", authEmailRecipient(target), url);
          }
        : undefined,
    },
    emailVerification: sendAuthEmail
      ? {
          // Cal doesn't block unverified users; it asks them to verify, so sign-in stays open.
          sendOnSignUp: true,
          autoSignInAfterVerification: true,
          sendVerificationEmail: async ({ user: target, url }) => {
            await sendAuthEmail("verify_email", authEmailRecipient(target), url);
          },
        }
      : undefined,
    socialProviders: google ? { google: { ...google, prompt: "select_account" } } : {},
    account: {
      // Google sign-in for an existing email/password user links instead of failing.
      accountLinking: { enabled: true, trustedProviders: ["google"] },
    },
    hooks: {
      before: beforeHook(requireAdminTwoFactor),
    },
    databaseHooks: { user: { create: userCreateHooks(users, schedules, eventTypes) } },
    plugins: [
      twoFactor({ issuer: "Cal.diy", backupCodeOptions: { amount: 10, length: 10 } }),
      adminPlugin(),
      apiKey({
        // Cal's key format: "cal_" + 32 hex characters. The prefix is stored for display only and
        // left out of the hash, which keeps keys issued by Cal valid after the data import.
        customKeyGenerator: () => randomHex(16),
        startingCharactersConfig: { shouldStore: true, charactersLength: 6 },
        // Cal's API v2 allows 120 requests a minute per key.
        rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 120 },
        keyExpiration: { defaultExpiresIn: null },
      }),
      teamsPlugin(sendAuthEmail, baseURL),
      ...(oidc ? [oidcPlugin(oidc)] : []),
      // Must stay last so it sees the cookies every other plugin sets.
      tanstackStartCookies(),
    ],
  });
}

/**
 * Sign-in through an OpenID Connect provider. It isn't a trusted provider for account linking, so it
 * signs into an existing account only when it reports that account's email as verified.
 */
function oidcPlugin(config: OidcConfig) {
  return genericOAuth({
    config: [
      {
        providerId: OIDC_PROVIDER_ID,
        discoveryUrl: config.discoveryUrl,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        scopes: ["openid", "email", "profile"],
        pkce: true,
        // Without the provider's published keys, ID tokens would be decoded without checking their signature.
        requireIdTokenVerification: true,
      },
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
