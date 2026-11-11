import process from "node:process";
import { updateProfilePhotoGoogle } from "@calcom/app-store/_utils/oauth/updateProfilePhotoGoogle";
import { updateProfilePhotoMicrosoft } from "@calcom/app-store/_utils/oauth/updateProfilePhotoMicrosoft";
import { createGoogleCalendarServiceWithGoogleType } from "@calcom/app-store/googlecalendar/lib/CalendarService";
import { getIdentityProvider } from "@calcom/features/auth/lib/identityProviders";
import {
  OUTLOOK_CLIENT_ID,
  OUTLOOK_CLIENT_SECRET,
  OUTLOOK_LOGIN_ENABLED,
} from "@calcom/features/auth/lib/outlook";
import { CredentialRepository } from "@calcom/features/credentials/repositories/CredentialRepository";
import { buildCredentialCreateData } from "@calcom/features/credentials/services/CredentialDataService";
import { ProfileRepository } from "@calcom/features/profile/repositories/ProfileRepository";
import { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import { isPasswordValid } from "@calcom/lib/auth/isPasswordValid";
import { checkRateLimitAndThrowError } from "@calcom/lib/checkRateLimitAndThrowError";
import {
  ENABLE_PROFILE_SWITCHER,
  GOOGLE_CALENDAR_SCOPES,
  GOOGLE_OAUTH_SCOPES,
  HOSTED_CAL_FEATURES,
  IS_CALCOM,
  IS_TEAM_BILLING_ENABLED,
  MICROSOFT_CALENDAR_SCOPES,
  WEBAPP_URL,
} from "@calcom/lib/constants";
import { symmetricDecrypt, symmetricEncrypt } from "@calcom/lib/crypto";
import { defaultCookies } from "@calcom/lib/default-cookies";
import { isENVDev } from "@calcom/lib/env";
import logger from "@calcom/lib/logger";
import { randomString } from "@calcom/lib/random";
import { safeStringify } from "@calcom/lib/safeStringify";
import { hashEmail } from "@calcom/lib/server/PiiHasher";
import slugify from "@calcom/lib/slugify";
import type { TrackingData } from "@calcom/lib/tracking";
import prisma from "@calcom/prisma";
import type { Membership, Team } from "@calcom/prisma/client";
import { CreationSource, IdentityProvider, MembershipRole, UserPermissionRole } from "@calcom/prisma/enums";
import { teamMetadataSchema, userMetadata } from "@calcom/prisma/zod-utils";
import type { UserProfile } from "@calcom/types/UserProfile";
import { calendar_v3 } from "@googleapis/calendar";
import { waitUntil } from "@vercel/functions";
import { OAuth2Client } from "googleapis-common";
import type { Account, AuthOptions, Profile, Session, User } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { encode } from "next-auth/jwt";
import AzureADProvider from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";
import EmailProvider from "next-auth/providers/email";
import GoogleProvider from "next-auth/providers/google";
import type { Provider } from "next-auth/providers/index";
import { getOrgUsernameFromEmail } from "../signup/utils/getOrgUsernameFromEmail";
import { dub } from "./dub";
import { ErrorCode } from "./ErrorCode";
import CalComAdapter from "./next-auth-custom-adapter";
import { verifyPassword } from "./verifyPassword";

type UserWithProfiles = NonNullable<
  Awaited<ReturnType<UserRepository["findByEmailAndIncludeProfilesAndPassword"]>>
>;

interface ExtendedOAuthProfile extends Profile {
  email_verified?: boolean; // Google/OIDC standard
  xms_edov?: boolean | string | number; // Azure AD specific
}

// This adapts our internal user model to what NextAuth expects
// NextAuth core requires id to be a string, so we handle that here
const AdapterUserPresenter = {
  fromCalUser: (
    user: UserWithProfiles,
    role: UserPermissionRole | "INACTIVE_ADMIN",
    hasActiveTeams: boolean
  ) => ({
    ...user,
    role: role as UserPermissionRole,
    belongsToActiveTeam: hasActiveTeams,
    profile: user.allProfiles[0],
  }),
};

// Account presenter to handle linkAccount calls
const AdapterAccountPresenter = {
  fromCalAccount: (account: Account, userId: number, providerEmail: string) => {
    return {
      ...account,
      userId: String(userId), // Convert userId to string for Next Auth
      providerEmail,
      // Ensure these required fields are present
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      type: account.type,
    };
  },
};

const log = logger.getSubLogger({ prefix: ["next-auth-options"] });
const GOOGLE_API_CREDENTIALS = process.env.GOOGLE_API_CREDENTIALS || "{}";
const { client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET } =
  JSON.parse(GOOGLE_API_CREDENTIALS)?.web || {};
const GOOGLE_LOGIN_ENABLED = process.env.GOOGLE_LOGIN_ENABLED === "true";
const IS_GOOGLE_LOGIN_ENABLED = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_LOGIN_ENABLED);
const ORGANIZATIONS_AUTOLINK =
  process.env.ORGANIZATIONS_AUTOLINK === "1" || process.env.ORGANIZATIONS_AUTOLINK === "true";

const usernameSlug = (username: string) => `${slugify(username)}-${randomString(6).toLowerCase()}`;
const getDomainFromEmail = (email: string): string => email.split("@")[1];

const loginWithTotp = async (email: string) =>
  `/auth/login?totp=${encodeURIComponent(await (await import("./signJwt")).default({ email }))}`;

type UserTeams = {
  teams: (Membership & {
    team: Pick<Team, "metadata">;
  })[];
};

export const checkIfUserBelongsToActiveTeam = <T extends UserTeams>(user: T) =>
  user.teams.some((m: { team: { metadata: unknown } }) => {
    if (!IS_TEAM_BILLING_ENABLED) {
      return true;
    }

    const metadata = teamMetadataSchema.safeParse(m.team.metadata);

    return metadata.success && metadata.data?.subscriptionId;
  });

const checkIfUserShouldBelongToOrg = async (idP: IdentityProvider, email: string) => {
  const [orgUsername, apexDomain] = email.split("@");
  if (!ORGANIZATIONS_AUTOLINK || (idP !== "GOOGLE" && idP !== "AZUREAD"))
    return { orgUsername, orgId: undefined };
  const existingOrg = await prisma.team.findFirst({
    where: {
      organizationSettings: {
        isOrganizationVerified: true,
        orgAutoAcceptEmail: apexDomain,
      },
    },
    select: {
      id: true,
    },
  });
  return { orgUsername, orgId: existingOrg?.id };
};

/**
 * Authorize function for credentials provider
 * Extracted for testability
 */
export async function authorizeCredentials(
  credentials: Record<"email" | "password" | "totpCode" | "backupCode", string> | undefined
): Promise<User | null> {
  log.debug("CredentialsProvider:credentials:authorize", safeStringify({ credentials }));
  if (!credentials) {
    console.error(`For some reason credentials are missing`);
    throw new Error(ErrorCode.InternalServerError);
  }

  const userRepo = new UserRepository(prisma);
  const user = await userRepo.findByEmailAndIncludeProfilesAndPassword({
    email: credentials.email,
  });
  // Don't leak information about it being username or password that is invalid
  if (!user) {
    throw new Error(ErrorCode.IncorrectEmailPassword);
  }

  // Locked users cannot login
  if (user.locked) {
    throw new Error(ErrorCode.UserAccountLocked);
  }

  await checkRateLimitAndThrowError({
    identifier: hashEmail(user.email),
  });

  // Users without a password must use their identity provider (Google/SAML) to login
  if (!user.password?.hash) {
    throw new Error(ErrorCode.IncorrectEmailPassword);
  }

  // Always verify password for users who have one
  const isCorrectPassword = await verifyPassword(credentials.password, user.password.hash);
  if (!isCorrectPassword) {
    throw new Error(ErrorCode.IncorrectEmailPassword);
  }

  if (user.twoFactorEnabled && credentials.backupCode) {
    if (!process.env.CALENDSO_ENCRYPTION_KEY) {
      console.error("Missing encryption key; cannot proceed with backup code login.");
      throw new Error(ErrorCode.InternalServerError);
    }

    if (!user.backupCodes) throw new Error(ErrorCode.MissingBackupCodes);

    const backupCodes = JSON.parse(symmetricDecrypt(user.backupCodes, process.env.CALENDSO_ENCRYPTION_KEY));

    // check if user-supplied code matches one
    const index = backupCodes.indexOf(credentials.backupCode.replaceAll("-", ""));
    if (index === -1) throw new Error(ErrorCode.IncorrectBackupCode);

    // delete verified backup code and re-encrypt remaining
    backupCodes[index] = null;
    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        backupCodes: symmetricEncrypt(JSON.stringify(backupCodes), process.env.CALENDSO_ENCRYPTION_KEY),
      },
    });
  } else if (user.twoFactorEnabled) {
    if (!credentials.totpCode) {
      throw new Error(ErrorCode.SecondFactorRequired);
    }

    if (!user.twoFactorSecret) {
      console.error(`Two factor is enabled for user ${user.id} but they have no secret`);
      throw new Error(ErrorCode.InternalServerError);
    }

    if (!process.env.CALENDSO_ENCRYPTION_KEY) {
      console.error(`"Missing encryption key; cannot proceed with two factor login."`);
      throw new Error(ErrorCode.InternalServerError);
    }

    const secret = symmetricDecrypt(user.twoFactorSecret, process.env.CALENDSO_ENCRYPTION_KEY);
    if (secret.length !== 32) {
      console.error(
        `Two factor secret decryption failed. Expected key with length 32 but got ${secret.length}`
      );
      throw new Error(ErrorCode.InternalServerError);
    }

    const isValidToken = (await import("@calcom/lib/totp")).totpAuthenticatorCheck(
      credentials.totpCode,
      secret
    );
    if (!isValidToken) {
      throw new Error(ErrorCode.IncorrectTwoFactorCode);
    }
  }
  // Check if the user you are logging into has any active teams
  const hasActiveTeams = checkIfUserBelongsToActiveTeam(user);

  // authentication success- but does it meet the minimum password requirements?
  const validateRole = (role: UserPermissionRole) => {
    // User's role is not "ADMIN"
    if (role !== UserPermissionRole.ADMIN) return role;
    // User's identity provider is not "CAL"
    if (user.identityProvider !== IdentityProvider.CAL) return role;

    if (process.env.NEXT_PUBLIC_IS_E2E) {
      console.warn("E2E testing is enabled, skipping password and 2FA requirements for Admin");
      return role;
    }

    // User's password is valid and two-factor authentication is enabled
    if (isPasswordValid(credentials.password, false, true) && user.twoFactorEnabled) return role;
    // Code is running in a development environment
    if (isENVDev) return role;
    // By this point it is an ADMIN without valid security conditions
    return "INACTIVE_ADMIN";
  };

  const role = validateRole(user.role);
  const baseUser = AdapterUserPresenter.fromCalUser(user, role, hasActiveTeams);

  if (role === "INACTIVE_ADMIN") {
    const passwordValid = isPasswordValid(credentials.password, false, true);
    const has2FA = user.twoFactorEnabled;

    let reason: "both" | "password" | "2fa";

    if (!passwordValid && !has2FA) {
      reason = "both";
    } else if (!passwordValid) {
      reason = "password";
    } else {
      reason = "2fa";
    }

    return { ...baseUser, inactiveAdminReason: reason };
  }

  return baseUser;
}

export const CalComCredentialsProvider = CredentialsProvider({
  id: "credentials",
  name: "Cal.diy",
  type: "credentials",
  credentials: {
    email: { label: "Email Address", type: "email", placeholder: "john.doe@example.com" },
    password: { label: "Password", type: "password", placeholder: "Your super secure password" },
    totpCode: { label: "Two-factor Code", type: "input", placeholder: "Code from authenticator app" },
    backupCode: { label: "Backup Code", type: "input", placeholder: "Two-factor backup code" },
  },
  authorize: authorizeCredentials,
});

const providers: Provider[] = [CalComCredentialsProvider];
type SamlIdpUser = {
  id: number;
  userId: number;
  firstName: string;
  lastName: string;
  email: string;
  name: string;
  email_verified: boolean;
  profile: UserProfile;
  samlTenant?: string;
};

if (IS_GOOGLE_LOGIN_ENABLED) {
  providers.push(
    GoogleProvider({
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          scope: [...GOOGLE_OAUTH_SCOPES, ...GOOGLE_CALENDAR_SCOPES].join(" "),
          access_type: "offline",
          prompt: "consent",
        },
      },
    })
  );
}

if (OUTLOOK_LOGIN_ENABLED && OUTLOOK_CLIENT_ID && OUTLOOK_CLIENT_SECRET) {
  providers.push(
    AzureADProvider({
      clientId: OUTLOOK_CLIENT_ID,
      clientSecret: OUTLOOK_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          scope: ["openid", "profile", "email", ...MICROSOFT_CALENDAR_SCOPES].join(" "),
          prompt: "consent",
        },
      },
      // Azure AD returns base64-encoded picture data (~9KB) that bloats the JWT cookie.
      // we exclude it here and fetch the profile photo separately via Microsoft Graph API.
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: null,
        };
      },
    })
  );
}

providers.push(
  EmailProvider({
    type: "email",
    maxAge: 10 * 60 * 60, // Magic links are valid for 10 min only
    // Here we setup the sendVerificationRequest that calls the email template with the identifier (email) and token to verify.
    sendVerificationRequest: async (props) => (await import("./sendVerificationRequest")).default(props),
  })
);

function isNumber(n: string) {
  return !Number.isNaN(parseFloat(n)) && !Number.isNaN(+n);
}

const calcomAdapter = CalComAdapter(prisma);

export const getOptions = ({
  getDubId,
  getTrackingData,
}: {
  /** so we can extract the Dub cookie in both pages and app routers */
  getDubId: () => string | undefined;
  /** Ad tracking data for Stripe customer metadata */
  getTrackingData: () => TrackingData;
}): AuthOptions => ({
  adapter: calcomAdapter,
  session: {
    strategy: "jwt",
  },
  jwt: {
    // decorate the native JWT encode function
    // Impl. detail: We don't pass through as this function is called with encode/decode functions.
    encode: async ({ token, maxAge, secret }) => {
      log.debug("jwt:encode", safeStringify({ token, maxAge }));
      if (token?.sub && isNumber(token.sub)) {
        const user = await prisma.user.findFirst({
          where: { id: Number(token.sub) },
          select: { metadata: true },
        });
        // if no user is found, we still don't want to crash here.
        if (user) {
          const metadata = userMetadata.parse(user.metadata);
          if (metadata?.sessionTimeout) {
            maxAge = metadata.sessionTimeout * 60;
          }
          if (metadata?.defaultHomeView && token) {
            token.defaultHomeView = metadata.defaultHomeView;
          }
        }
      }
      return encode({ secret, token, maxAge });
    },
  },
  cookies: defaultCookies(WEBAPP_URL?.startsWith("https://")),
  pages: {
    signIn: "/auth/login",
    signOut: "/auth/logout",
    error: "/auth/error", // Error code passed in query string as ?error=
    verifyRequest: "/auth/verify",
    // newUser: "/auth/new", // New users will be directed here on first sign in (leave the property out if not of interest)
  },
  providers,
  callbacks: {
    async jwt({
      // Always available but with a little difference in value
      token,
      // Available only in case of signIn, signUp or useSession().update call.
      trigger,
      // Available when useSession().update is called. The value will be the POST data
      session,
      // Available only in the first call once the user signs in. Not available in subsequent calls
      user,
      // Available only in the first call once the user signs in. Not available in subsequent calls
      account,
    }) {
      log.debug("callbacks:jwt", safeStringify({ token, user, account, trigger, session }));
      // The data available in 'session' depends on what data was supplied in update method call of session
      if (trigger === "update") {
        return {
          ...token,
          profileId: session?.profileId ?? token.profileId ?? null,
          upId: session?.upId ?? token.upId ?? null,
          locale: session?.locale ?? token.locale ?? "en",
          name: session?.name ?? token.name,
          username: session?.username ?? token.username,
          email: session?.email ?? token.email,
        } as JWT;
      }
      const autoMergeIdentities = async () => {
        const existingUser = await prisma.user.findFirst({
          where: { email: token.email! },
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            name: true,
            email: true,
            role: true,
            locale: true,
            metadata: true,
            movedToProfileId: true,
            teams: {
              include: {
                team: {
                  select: {
                    id: true,
                    metadata: true,
                  },
                },
              },
            },
          },
        });

        if (!existingUser) {
          return token;
        }

        // Check if the existingUser has any active teams
        const belongsToActiveTeam = checkIfUserBelongsToActiveTeam(existingUser);
        const { teams: _teams, metadata: userMeta, ...existingUserWithoutTeamsField } = existingUser;
        const parsedMetadata = userMetadata.safeParse(userMeta);
        const defaultHomeView = parsedMetadata.success ? parsedMetadata.data?.defaultHomeView : undefined;
        const allProfiles = await ProfileRepository.findAllProfilesForUserIncludingMovedUser(existingUser);
        log.debug(
          "callbacks:jwt:autoMergeIdentities",
          safeStringify({
            allProfiles,
          })
        );
        const { upId } = determineProfile({ profiles: allProfiles, token });

        const profile = await ProfileRepository.findByUpIdWithAuth(upId, existingUser.id);
        if (!profile) {
          throw new Error("Profile not found");
        }

        const profileOrg = profile?.organization;
        let orgRole: MembershipRole | undefined;
        // Get users role of org
        if (profileOrg) {
          const membership = await prisma.membership.findUnique({
            where: {
              userId_teamId: {
                teamId: profileOrg.id,
                userId: existingUser.id,
              },
            },
          });
          orgRole = membership?.role;
        }

        return {
          ...existingUserWithoutTeamsField,
          ...token,
          profileId: profile.id,
          upId,
          belongsToActiveTeam,
          orgAwareUsername: profileOrg ? profile.username : existingUser.username,
          defaultHomeView: defaultHomeView ?? undefined,
          // All organizations in the token would be too big to store. It breaks the sessions request.
          // So, we just set the currently switched organization only here.
          // platform org user don't need profiles nor domains
          org:
            profileOrg && !profileOrg.isPlatform
              ? {
                  id: profileOrg.id,
                  name: profileOrg.name,
                  slug: profileOrg.slug ?? "",
                  logoUrl: profileOrg.logoUrl,
                  fullDomain: WEBAPP_URL,
                  domainSuffix: "",
                  role: orgRole as MembershipRole, // It can't be undefined if we have a profileOrg
                }
              : null,
        } as JWT;
      };
      if (!user) {
        return await autoMergeIdentities();
      }
      if (!account) {
        return token;
      }
      if (account.type === "credentials") {
        log.debug("callbacks:jwt:accountType:credentials", safeStringify({ account }));
        // return token if credentials,saml-idp
        if (account.provider === "saml-idp") {
          const samlIdpUser = user as SamlIdpUser;
          const updatedToken = {
            ...token,
            // Server Session explicitly requires sub to be userId. So, override what is set by BoxyHQ
            sub: samlIdpUser.userId.toString(),
            upId: samlIdpUser.profile?.upId ?? token.upId ?? null,
          } as JWT;
          return updatedToken;
        }
        // any other credentials, add user info
        return {
          ...token,
          id: user.id,
          name: user.name,
          username: user.username,
          orgAwareUsername: user?.org ? user.profile?.username : user.username,
          email: user.email,
          role: user.role,
          impersonatedBy: user.impersonatedBy,
          belongsToActiveTeam: user?.belongsToActiveTeam,
          org: user?.org,
          locale: user?.locale,
          profileId: user.profile?.id ?? token.profileId ?? null,
          upId: user.profile?.upId ?? token.upId ?? null,
          inactiveAdminReason: user.inactiveAdminReason,
        } as JWT;
      }

      // The arguments above are from the provider so we need to look up the
      // user based on those values in order to construct a JWT.
      if (account.type === "oauth") {
        log.debug("callbacks:jwt:accountType:oauth", safeStringify({ account }));
        if (!account.provider || !account.providerAccountId) {
          return { ...token, upId: user.profile?.upId ?? token.upId ?? null } as JWT;
        }
        const idP = getIdentityProvider(account.provider);

        if (!idP) {
          log.warn("callbacks:jwt:accountType:oauth - unknown provider, falling back to auto-merge", {
            provider: account.provider,
          });
          return await autoMergeIdentities();
        }

        const existingUser = await prisma.user.findFirst({
          where: {
            AND: [
              {
                identityProvider: idP,
              },
              {
                identityProviderId: account.providerAccountId,
              },
            ],
          },
        });

        if (!existingUser) {
          return await autoMergeIdentities();
        }

        const grantedScopes = account.scope?.split(" ") ?? [];
        if (
          account.provider === "google" &&
          !(await CredentialRepository.findFirstByAppIdAndUserId({
            userId: Number(user.id),
            appId: "google-calendar",
          })) &&
          GOOGLE_CALENDAR_SCOPES.every((scope) => grantedScopes.includes(scope))
        ) {
          // Installing Google Calendar by default
          const credentialkey = {
            access_token: account.access_token,
            refresh_token: account.refresh_token,
            id_token: account.id_token,
            token_type: account.token_type,
            expires_at: account.expires_at,
          };
          const gcalCredentialData = buildCredentialCreateData({
            userId: Number(user.id),
            key: credentialkey,
            appId: "google-calendar",
            type: "google_calendar",
          });
          const gcalCredential = await CredentialRepository.create(gcalCredentialData);
          const gCalService = createGoogleCalendarServiceWithGoogleType({
            ...gcalCredential,
            user: null,
            delegatedTo: null,
          });

          if (
            !(await CredentialRepository.findFirstByUserIdAndType({
              userId: Number(user.id),
              type: "google_video",
            }))
          ) {
            const googleMeetCredentialData = buildCredentialCreateData({
              type: "google_video",
              key: {},
              userId: Number(user.id),
              appId: "google-meet",
            });
            await CredentialRepository.create(googleMeetCredentialData);
          }

          const oAuth2Client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
          oAuth2Client.setCredentials(credentialkey);
          const calendar = new calendar_v3.Calendar({
            auth: oAuth2Client,
          });
          const primaryCal = await gCalService.getPrimaryCalendar(calendar);
          if (primaryCal?.id) {
            await gCalService.createSelectedCalendar({
              externalId: primaryCal.id,
              userId: Number(user.id),
            });
          }
          await updateProfilePhotoGoogle(oAuth2Client, Number(user.id));
        }

        // Installing Outlook Calendar by default for Microsoft/Azure AD sign-in
        // Note: offline_access is requested but not returned in scope list by Microsoft
        const microsoftCalendarScopesToCheck = MICROSOFT_CALENDAR_SCOPES.filter(
          (scope) => scope !== "offline_access"
        );
        if (
          account.provider === "azure-ad" &&
          !(await CredentialRepository.findFirstByAppIdAndUserId({
            userId: Number(user.id),
            appId: "office365-calendar",
          })) &&
          microsoftCalendarScopesToCheck.every((scope) => grantedScopes.includes(scope))
        ) {
          const credentialKey = {
            access_token: account.access_token,
            refresh_token: account.refresh_token,
            email: user.email,
            // convert seconds to milliseconds — OAuthManager compares expiry_date against Date.now()
            expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
          };

          const outlookCredentialData = buildCredentialCreateData({
            userId: Number(user.id),
            key: credentialKey,
            appId: "office365-calendar",
            type: "office365_calendar",
          });
          const outlookCredential = await CredentialRepository.create(outlookCredentialData);

          // Fetch default calendar from Microsoft Graph API
          try {
            const calendarResponse = await fetch(
              "https://graph.microsoft.com/v1.0/me/calendars?$select=id,isDefaultCalendar",
              {
                headers: {
                  Authorization: `Bearer ${account.access_token}`,
                  "Content-Type": "application/json",
                },
              }
            );

            if (calendarResponse.ok) {
              const calendarData = await calendarResponse.json();
              const defaultCalendar = calendarData.value?.find(
                (cal: { isDefaultCalendar?: boolean }) => cal.isDefaultCalendar
              );

              if (defaultCalendar?.id) {
                await prisma.selectedCalendar.create({
                  data: {
                    userId: Number(user.id),
                    integration: "office365_calendar",
                    externalId: defaultCalendar.id,
                    credentialId: outlookCredential.id,
                  },
                });
              }
            }
          } catch (error) {
            log.error("Failed to fetch default calendar for Microsoft sign-in", error);
          }

          // Update profile photo for Microsoft/Azure AD sign-in
          if (account.access_token) {
            await updateProfilePhotoMicrosoft(account.access_token, Number(user.id));
          }
        } else if (account.provider === "azure-ad" && account.access_token) {
          // Update profile photo even if calendar wasn't installed
          await updateProfilePhotoMicrosoft(account.access_token, Number(user.id));
        }

        const allProfiles = await ProfileRepository.findAllProfilesForUserIncludingMovedUser(existingUser);
        const { upId } = determineProfile({ profiles: allProfiles, token });
        log.debug(
          "callbacks:jwt:accountType:oauth:existingUser",
          safeStringify({ userId: existingUser.id, upId })
        );
        return {
          ...token,
          upId,
          id: existingUser.id,
          name: existingUser.name,
          username: existingUser.username,
          email: existingUser.email,
          avatarUrl: existingUser.avatarUrl,
          role: existingUser.role,
          belongsToActiveTeam: token?.belongsToActiveTeam as boolean,
          impersonatedBy: token.impersonatedBy,
          org: token?.org,
          orgAwareUsername: token.orgAwareUsername,
          locale: existingUser.locale,
        } as JWT;
      }

      if (account.type === "email") {
        return await autoMergeIdentities();
      }

      log.warn(
        "callbacks:jwt - unknown account type",
        safeStringify({ accountType: account.type, accountProvider: account.provider })
      );
      return token;
    },
    async session({ session, token, user }) {
      log.debug("callbacks:session - Session callback called", safeStringify({ session, token, user }));
      const hasValidLicense = false;
      const profileId = token.profileId;
      const calendsoSession: Session = {
        ...session,
        profileId,
        upId: token.upId || session.upId,
        hasValidLicense,
        user: {
          ...session.user,
          id: token.id as number,
          name: token.name,
          username: token.username as string,
          orgAwareUsername: token.orgAwareUsername,
          role: token.role as UserPermissionRole,
          impersonatedBy: token.impersonatedBy,
          belongsToActiveTeam: token?.belongsToActiveTeam as boolean,
          org: token?.org,
          locale: token.locale,
          inactiveAdminReason: token.inactiveAdminReason,
          defaultHomeView: token.defaultHomeView,
        },
      };
      return calendsoSession;
    },
    async signIn(params): Promise<boolean | string> {
      const {
        /**
         * Available when Credentials provider is used - Has the value returned by authorize callback
         */
        user,
        /**
         * Available when Credentials provider is used - Has the value submitted as the body of the HTTP POST submission
         */
        profile,
        account,
      } = params;

      log.debug("callbacks:signin", safeStringify(params));

      if (account?.provider === "email") {
        return true;
      }
      // In this case we've already verified the credentials in the authorize
      // callback so we can sign the user in.
      // Only if provider is not saml-idp
      if (account?.provider !== "saml-idp") {
        if (account?.type === "credentials") {
          return true;
        }

        if (account?.type !== "oauth") {
          log.warn("callbacks:signIn - unsupported account type for non-saml-idp provider", {
            accountType: account?.type,
            provider: account?.provider,
          });
          return false;
        }
      }
      if (!user.email) {
        log.warn("callbacks:signIn - user email is missing", { provider: account?.provider });
        return false;
      }

      if (!user.name) {
        log.warn("callbacks:signIn - user name is missing", {
          emailDomain: user.email.split("@")[1],
          provider: account?.provider,
        });
        return false;
      }
      if (account?.provider) {
        const idP = getIdentityProvider(account.provider);

        if (!idP) {
          log.warn("callbacks:signIn - unknown provider, rejecting login", {
            provider: account.provider,
          });
          return "/auth/error?error=unknown-provider";
        }
        // Use optional chaining for safety, especially with AdapterUser potentially having different structure initially.
        const isEmailVerified = user.emailVerified || (profile as ExtendedOAuthProfile)?.email_verified;

        // For Azure AD, check xms_edov (Email Domain Owner Verified) claim
        // xms_edov returns inconsistent types: boolean for work/school, string "1" for personal accounts
        const xmsEdov = (profile as ExtendedOAuthProfile)?.xms_edov;
        const isAzureEmailDomainVerified =
          xmsEdov === true || xmsEdov === "true" || xmsEdov === "1" || xmsEdov === 1;

        // Azure AD never sets email_verified in the token profile, so isEmailVerified is always
        // falsy for AZUREAD logins. Use isAzureEmailDomainVerified (xms_edov) as the equivalent
        // proof of ownership so the auto-merge path treats Azure AD the same as other verified IdPs.
        const isVerified =
          isEmailVerified || (idP === IdentityProvider.AZUREAD && isAzureEmailDomainVerified);

        if (idP === IdentityProvider.AZUREAD && !isAzureEmailDomainVerified) {
          log.error(
            "Azure AD email domain not verified (xms_edov claim)",
            safeStringify({ emailDomain: user.email?.split("@")[1], xmsEdov })
          );
          return "/auth/error?error=unverified-email";
        }

        if (!isEmailVerified && idP !== IdentityProvider.AZUREAD) {
          log.error("Attention: SAML/Google User email is not verified in the IdP", safeStringify({ user }));
          return "/auth/error?error=unverified-email";
        }

        let existingUser = await prisma.user.findFirst({
          include: {
            password: {
              select: {
                hash: true,
              },
            },
            accounts: {
              where: {
                provider: account.provider,
              },
            },
          },
          where: {
            identityProvider: idP,
            identityProviderId: {
              equals: account.providerAccountId,
              mode: "insensitive",
            },
          },
        });

        /* --- START FIX LEGACY ISSUE WHERE 'identityProviderId' was accidentally set to userId --- */
        if (!existingUser) {
          existingUser = await prisma.user.findFirst({
            include: {
              password: {
                select: {
                  hash: true,
                },
              },
              accounts: {
                where: {
                  provider: account.provider,
                },
              },
            },
            where: {
              identityProvider: idP,
              identityProviderId: String(user.id),
            },
          });
          if (existingUser) {
            await prisma.user.update({
              where: {
                id: existingUser?.id,
              },
              data: {
                identityProviderId: account.providerAccountId,
              },
            });
          }
        }
        /* --- END FIXES LEGACY ISSUE WHERE 'identityProviderId' was accidentally set to userId --- */
        if (existingUser) {
          // In this case there's an existing user and their email address
          // hasn't changed since they last logged in.
          if (existingUser.email === user.email) {
            try {
              // If old user without Account entry we link their google account
              if (existingUser.accounts.length === 0) {
                const linkAccountWithUserData = AdapterAccountPresenter.fromCalAccount(
                  account,
                  existingUser.id,
                  user.email
                );
                await calcomAdapter.linkAccount(linkAccountWithUserData);
              }
            } catch (error) {
              if (error instanceof Error) {
                log.error("Error while linking account of already existing user", safeStringify(error));
              }
            }
            if (existingUser.twoFactorEnabled && existingUser.identityProvider === idP) {
              return loginWithTotp(existingUser.email);
            } else {
              return true;
            }
          }

          // If the email address doesn't match, check if an account already exists
          // with the new email address. If it does, for now we return an error. If
          // not, update the email of their account and log them in.
          const userWithNewEmail = await prisma.user.findFirst({
            where: { email: user.email },
          });

          if (!userWithNewEmail) {
            await prisma.user.update({ where: { id: existingUser.id }, data: { email: user.email } });
            if (existingUser.twoFactorEnabled) {
              return loginWithTotp(existingUser.email);
            } else {
              return true;
            }
          } else {
            return "/auth/error?error=new-email-conflict";
          }
        }

        // If there's no existing user for this identity provider and id, create
        // a new account. If an account already exists with the incoming email
        // address return an error for now.

        const existingUserWithEmail = await prisma.user.findFirst({
          where: {
            email: {
              equals: user.email,
              mode: "insensitive",
            },
          },
          include: {
            password: {
              select: {
                hash: true,
              },
            },
          },
        });

        if (existingUserWithEmail) {
          // if self-hosted then we can allow auto-merge of identity providers if email is verified
          if (isVerified && existingUserWithEmail.identityProvider !== IdentityProvider.CAL) {
            if (existingUserWithEmail.twoFactorEnabled) {
              return loginWithTotp(existingUserWithEmail.email);
            } else {
              return true;
            }
          }

          // check if user was invited
          if (
            !existingUserWithEmail.password?.hash &&
            !existingUserWithEmail.emailVerified &&
            !existingUserWithEmail.username
          ) {
            await prisma.user.update({
              where: {
                email: existingUserWithEmail.email,
              },
              data: {
                // update the email to the IdP email
                email: user.email,
                // Slugify the incoming name and append a few random characters to
                // prevent conflicts for users with the same name.
                username: getOrgUsernameFromEmail(user.email, getDomainFromEmail(user.email)),
                emailVerified: new Date(Date.now()),
                name: user.name,
                identityProvider: idP,
                identityProviderId: account.providerAccountId,
              },
            });

            if (existingUserWithEmail.twoFactorEnabled) {
              return loginWithTotp(existingUserWithEmail.email);
            } else {
              return true;
            }
          }

          // User signs up with email/password and then tries to login with Google/SAML/AzureAD using the same email
          if (
            existingUserWithEmail.identityProvider === IdentityProvider.CAL &&
            (idP === IdentityProvider.GOOGLE ||
              idP === IdentityProvider.SAML ||
              idP === IdentityProvider.AZUREAD)
          ) {
            // Prevent account pre-hijacking: block OAuth linking for unverified accounts
            if (!existingUserWithEmail.emailVerified) {
              return "/auth/error?error=unverified-email";
            }

            await prisma.user.update({
              where: { email: existingUserWithEmail.email },
              data: {
                email: user.email.toLowerCase(),
                identityProvider: idP,
                identityProviderId: account.providerAccountId,
              },
            });

            if (existingUserWithEmail.twoFactorEnabled) {
              return loginWithTotp(existingUserWithEmail.email);
            } else {
              return true;
            }
          } else if (existingUserWithEmail.identityProvider === IdentityProvider.CAL) {
            log.error(`Userid ${user.id} already exists with CAL identity provider`);
            return `/auth/error?error=wrong-provider&provider=${existingUserWithEmail.identityProvider}`;
          } else if (
            existingUserWithEmail.identityProvider === IdentityProvider.GOOGLE &&
            idP === IdentityProvider.AZUREAD
          ) {
            await prisma.user.update({
              where: { email: existingUserWithEmail.email },
              data: {
                email: user.email.toLowerCase(),
                identityProvider: idP,
                identityProviderId: account.providerAccountId,
              },
            });

            if (existingUserWithEmail.twoFactorEnabled) {
              return loginWithTotp(existingUserWithEmail.email);
            } else {
              return true;
            }
          } else if (
            existingUserWithEmail.identityProvider === IdentityProvider.AZUREAD &&
            idP === IdentityProvider.GOOGLE
          ) {
            await prisma.user.update({
              where: { email: existingUserWithEmail.email },
              data: {
                email: user.email.toLowerCase(),
                identityProvider: idP,
                identityProviderId: account.providerAccountId,
              },
            });

            if (existingUserWithEmail.twoFactorEnabled) {
              return loginWithTotp(existingUserWithEmail.email);
            } else {
              return true;
            }
          }
          log.error(`Userid ${user.id} trying to login with the wrong provider`, {
            userId: user.id,
            account: {
              providerAccountId: account?.providerAccountId,
              type: account?.type,
              provider: account?.provider,
            },
          });
          return `/auth/error?error=wrong-provider&provider=${existingUserWithEmail.identityProvider}`;
        }

        // Associate with organization if enabled by flag and idP is Google or Azure AD
        const { orgUsername, orgId } = await checkIfUserShouldBelongToOrg(idP, user.email);

        try {
          const newUsername = orgId ? slugify(orgUsername) : usernameSlug(user.name);
          const newUser = await prisma.user.create({
            data: {
              // Slugify the incoming name and append a few random characters to
              // prevent conflicts for users with the same name.
              username: newUsername,
              emailVerified: new Date(Date.now()),
              name: user.name,
              ...(user.image && { avatarUrl: user.image }),
              email: user.email,
              identityProvider: idP,
              identityProviderId: account.providerAccountId,
              ...(orgId && {
                verified: true,
                organization: { connect: { id: orgId } },
                teams: {
                  create: { role: MembershipRole.MEMBER, accepted: true, team: { connect: { id: orgId } } },
                },
              }),
              creationSource: CreationSource.WEBAPP,
            },
          });
          const linkAccountNewUserData = AdapterAccountPresenter.fromCalAccount(
            account,
            newUser.id,
            user.email
          );
          await calcomAdapter.linkAccount(linkAccountNewUserData);

          // Update profile photo for new Microsoft/Azure AD users
          if (account.provider === "azure-ad" && account.access_token) {
            await updateProfilePhotoMicrosoft(account.access_token, newUser.id);
          }

          if (newUser.twoFactorEnabled) {
            return loginWithTotp(newUser.email);
          } else {
            return true;
          }
        } catch (err) {
          log.error("Error creating a new user", err);
          return `/auth/error?error=user-creation-error`;
        }
      }

      log.warn("callbacks:signIn - no matching provider or condition, denying access", {
        provider: account?.provider,
        accountType: account?.type,
      });
      return false;
    },
    /**
     * Used to handle the navigation right after successful login or logout
     */
    async redirect({ url, baseUrl }) {
      // Allows relative callback URLs
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      // Allows callback URLs on the same domain
      else if (new URL(url).hostname === new URL(WEBAPP_URL).hostname) return url;
      return baseUrl;
    },
  },
  events: {
    async signIn(message) {
      /* only run this code if:
         - it's a hosted cal account
         - DUB_API_KEY is configured
         - it's a new user
      */
      const user = message.user as User & {
        username: string;
        createdDate: string;
      };
      // check if the user was created in the last 10 minutes
      // this is a workaround – in the future once we move to use the Account model in the DB
      // we should use NextAuth's isNewUser flag instead: https://next-auth.js.org/configuration/events#signin
      const isNewUser = new Date(user.createdDate) > new Date(Date.now() - 10 * 60 * 1000);
      if ((isENVDev || IS_CALCOM) && isNewUser) {
        if (process.env.DUB_API_KEY) {
          const clickId = getDubId();
          // check if there's a clickId (dub_id) cookie set by @dub/analytics
          if (clickId) {
            // here we use waitUntil – meaning this code will run async to not block the main thread
            waitUntil(
              // if so, send a lead event to Dub
              // @see https://d.to/conversions/next-auth
              dub.track.lead({
                clickId,
                eventName: "Sign Up",
                externalId: user.id.toString(),
                customerName: user.name,
                customerEmail: user.email,
                customerAvatar: user.image,
              })
            );
          }
        }
      }
    },
  },
});

/**
 * Identifies the profile the user should be logged into.
 */
const determineProfile = ({
  token,
  profiles,
}: {
  token: JWT;
  profiles: { id: number | null; upId: string }[];
}) => {
  // If profile switcher is disabled, we can only show the first profile.
  if (!ENABLE_PROFILE_SWITCHER) {
    return profiles[0];
  }

  if (token.upId) {
    // Otherwise use what's in the token
    return { profileId: token.profileId, upId: token.upId as string };
  }

  // If there is just one profile it has to be the one we want to log into.
  return profiles[0];
};
