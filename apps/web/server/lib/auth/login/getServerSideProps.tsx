import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { verifyTotpJwt } from "@calcom/features/auth/lib/signJwt";
import { getSafeRedirectUrl } from "@calcom/lib/getSafeRedirectUrl";
import prisma from "@calcom/prisma";
import { IS_GOOGLE_LOGIN_ENABLED } from "@server/lib/constants";
import type { GetServerSidePropsContext } from "next";
import { getCsrfToken } from "next-auth/react";

/**
 * Server-side props handler for the login page.
 *
 * Verifies any active session, validates incoming SSO TOTP query tokens,
 * and fetches CSRF and OAuth provider configuration.
 *
 * @param context - Next.js server-side props execution context.
 * @returns Props object or redirect instructions for the LoginView component.
 */
export async function getServerSideProps(context: GetServerSidePropsContext) {
  const { req, query } = context;

  const session = await getServerSession({ req });

  let totpEmail = null;
  let totpToken: string | null = null;
  if (context.query.totp) {
    try {
      const decryptedJwt = await verifyTotpJwt(context.query.totp as string);
      if (decryptedJwt.payload) {
        totpEmail = (decryptedJwt.payload.email as string) || (decryptedJwt.payload.sub as string);
        totpToken = context.query.totp as string;
      } else {
        return {
          redirect: {
            destination: "/auth/error?error=JWT%20Invalid%20Payload",
            permanent: false,
          },
        };
      }
    } catch {
      return {
        redirect: {
          destination: "/auth/error?error=Invalid%20JWT%3A%20Please%20try%20again",
          permanent: false,
        },
      };
    }
  }

  if (session) {
    const { callbackUrl } = query;

    if (callbackUrl) {
      try {
        const destination = getSafeRedirectUrl(callbackUrl as string);
        if (destination) {
          return {
            redirect: {
              destination,
              permanent: false,
            },
          };
        }
      } catch (e) {
        console.warn(e);
      }
    }

    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }

  const userExists = await prisma.user.findFirst({ select: { id: true } });
  if (!userExists) {
    // Proceed to new onboarding to create first admin user
    return {
      redirect: {
        destination: "/auth/setup",
        permanent: false,
      },
    };
  }
  return {
    props: {
      csrfToken: await getCsrfToken(context),
      isGoogleLoginEnabled: IS_GOOGLE_LOGIN_ENABLED,
      isOutlookLoginEnabled: false,
      totpEmail,
      totpToken,
    },
  };
}
