import process from "node:process";
import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { IS_OIDC_LOGIN_ENABLED, OIDC_PROVIDER_NAME } from "@calcom/features/auth/lib/oidc";
import { getOrgUsernameFromEmail } from "@calcom/features/auth/signup/utils/getOrgUsernameFromEmail";
import { FeaturesRepository } from "@calcom/features/flags/features.repository";
import { IS_SELF_HOSTED, WEBAPP_URL } from "@calcom/lib/constants";
import { emailSchema } from "@calcom/lib/emailSchema";
import slugify from "@calcom/lib/slugify";
import { teamMetadataSchema } from "@calcom/prisma/zod-utils";
import { IS_GOOGLE_LOGIN_ENABLED } from "@server/lib/constants";
import type { GetServerSidePropsContext } from "next";
import { z } from "zod";

const checkValidEmail = (email: string) => emailSchema.safeParse(email).success;

const querySchema = z.object({
  username: z
    .string()
    .optional()
    .transform((val) => val || ""),
  email: emailSchema.optional(),
});

export const getServerSideProps = async (ctx: GetServerSidePropsContext) => {
  const prisma = await import("@calcom/prisma").then((mod) => mod.default);
  const featuresRepository = new FeaturesRepository(prisma);
  const emailVerificationEnabled =
    await featuresRepository.checkIfFeatureIsEnabledGlobally("email-verification");
  const signupDisabled = await featuresRepository.checkIfFeatureIsEnabledGlobally("disable-signup");
  const onboardingV3Enabled = await featuresRepository.checkIfFeatureIsEnabledGlobally("onboarding-v3");

  const token = z.string().optional().parse(ctx.query.token);
  const redirectUrlData = z
    .string()
    .refine((value) => value.startsWith(WEBAPP_URL), {
      params: (value: string) => ({ value }),
      message: "Redirect URL must start with 'cal.com'",
    })
    .optional()
    .safeParse(ctx.query.redirect);

  const redirectUrl = redirectUrlData.success && redirectUrlData.data ? redirectUrlData.data : null;

  const session = await getServerSession({
    req: ctx.req,
  });

  if (session?.user?.id) {
    return {
      redirect: {
        permanent: false,
        destination: redirectUrl || "/",
      },
    } as const;
  }

  const props = {
    redirectUrl,
    isGoogleLoginEnabled: IS_GOOGLE_LOGIN_ENABLED,
    isOidcLoginEnabled: IS_OIDC_LOGIN_ENABLED,
    oidcProviderName: OIDC_PROVIDER_NAME,

    prepopulateFormValues: undefined,
    emailVerificationEnabled,
    onboardingV3Enabled,
  };

  if ((process.env.NEXT_PUBLIC_DISABLE_SIGNUP === "true" && !token) || signupDisabled) {
    return {
      redirect: {
        permanent: false,
        destination: `/auth/error?error=Signup is disabled in this instance`,
      },
    } as const;
  }

  // no token given, treat as a normal signup without verification token
  if (!token) {
    // username + email prepopulated from query params
    const queryData = querySchema.safeParse(ctx.query);
    return {
      props: JSON.parse(
        JSON.stringify({
          ...props,
          prepopulateFormValues: {
            username: queryData.success ? queryData.data.username : null,
            email: queryData.success ? queryData.data.email : null,
          },
        })
      ),
    };
  }

  const verificationToken = await prisma.verificationToken.findUnique({
    where: {
      token,
    },
    include: {
      team: {
        select: {
          metadata: true,
          isOrganization: true,
          parentId: true,
          parent: {
            select: {
              slug: true,
              isOrganization: true,
              organizationSettings: true,
            },
          },
          slug: true,
          organizationSettings: true,
        },
      },
    },
  });

  if (!verificationToken || verificationToken.expires < new Date()) {
    return {
      redirect: {
        permanent: false,
        destination: `/auth/error?error=Verification Token is missing or has expired`,
      },
    } as const;
  }

  if (!verificationToken?.team) {
    return {
      redirect: {
        permanent: false,
        destination: `/auth/error?error=Verification Token is not associated with any team`,
      },
    } as const;
  }

  const isValidEmail = checkValidEmail(verificationToken.identifier);
  if (isValidEmail) {
    const existingUser = await prisma.user.findFirst({
      where: {
        AND: [
          {
            email: verificationToken.identifier,
          },
          {
            emailVerified: {
              not: null,
            },
          },
        ],
      },
      select: {
        id: true,
      },
    });

    if (existingUser) {
      return {
        redirect: {
          permanent: false,
          destination: `/auth/login?callbackUrl=${WEBAPP_URL}/${ctx.query.callbackUrl}`,
        },
      };
    }
  }

  const guessUsernameFromEmail = (email: string) => {
    const [username] = email.split("@");
    return username;
  };

  let username = isValidEmail ? guessUsernameFromEmail(verificationToken.identifier) : "";

  const tokenTeam = {
    ...verificationToken.team,
    metadata: teamMetadataSchema.parse(verificationToken.team.metadata ?? null),
  };

  const isATeamInOrganization = tokenTeam?.parentId !== null;
  // Detect if the team is an org by either the metadata flag or if it has a parent team
  const isOrganization = tokenTeam.isOrganization;
  const isOrganizationOrATeamInOrganization = isOrganization || isATeamInOrganization;
  // If we are dealing with an org, the slug may come from the team itself or its parent
  const orgSlug = isOrganizationOrATeamInOrganization
    ? tokenTeam.metadata?.requestedSlug || tokenTeam.parent?.slug || tokenTeam.slug
    : null;

  // Org context shouldn't check if a username is premium
  if (!IS_SELF_HOSTED && !isOrganizationOrATeamInOrganization && username) {
    // Im not sure we actually hit this because of next redirects signup to website repo - but just in case this is pretty cool :)
    const available = true;
    const suggestion: string | undefined = undefined;

    username = available ? username : suggestion || username;
  }

  const isOrgInviteByLink = isOrganizationOrATeamInOrganization && !isValidEmail;
  const parentOrgSettings = tokenTeam?.parent?.organizationSettings ?? null;

  return {
    props: {
      ...props,
      token,
      prepopulateFormValues:
        !isOrgInviteByLink && isValidEmail
          ? {
              email: verificationToken.identifier,
              username: isOrganizationOrATeamInOrganization
                ? getOrgUsernameFromEmail(
                    verificationToken.identifier,
                    (isOrganization
                      ? tokenTeam.organizationSettings?.orgAutoAcceptEmail
                      : parentOrgSettings?.orgAutoAcceptEmail) || ""
                  )
                : slugify(username),
            }
          : null,
      orgSlug,
      orgAutoAcceptEmail: isOrgInviteByLink
        ? (tokenTeam?.organizationSettings?.orgAutoAcceptEmail ??
          parentOrgSettings?.orgAutoAcceptEmail ??
          null)
        : null,
    },
  };
};
