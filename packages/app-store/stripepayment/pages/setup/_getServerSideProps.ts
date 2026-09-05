import type { GetServerSidePropsContext } from "next";
import stringify from "qs-stringify";
import type Stripe from "stripe";
import { z } from "zod";

import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { WEBAPP_URL } from "@calcom/lib/constants";
import prisma from "@calcom/prisma";

import type { IntegrationOAuthCallbackState } from "@calcom/app-store/types";
import { getStripeAppKeys } from "../../lib/getStripeAppKeys";

export const getServerSideProps = async (ctx: GetServerSidePropsContext) => {
  const notFound = { notFound: true } as const;
  if (typeof ctx.params?.slug !== "string") return notFound;

  const session = await getServerSession({ req: ctx.req });

  if (!session?.user?.uuid) {
    return {
      redirect: {
        destination: "/auth/login",
        permanent: false,
      },
    };
  }

  const user = await prisma.user.findUnique({
    where: {
      uuid: session.user.uuid,
    },
    select: {
      email: true,
      name: true,
    },
  });

  if (!user) {
    return notFound;
  }

  try {
    const { client_id } = await getStripeAppKeys();
    if (!client_id) {
      return {
        redirect: {
          destination: `${WEBAPP_URL}/apps/installed/payment?error=stripe_connect_not_configured`,
          permanent: false,
        },
      };
    }
    const returnTo = ctx.query.returnTo ? String(ctx.query.returnTo) : undefined;
    const onErrorReturnTo = ctx.query.onErrorReturnTo
      ? String(ctx.query.onErrorReturnTo)
      : `${WEBAPP_URL}/apps/installed/payment`;

    const state: IntegrationOAuthCallbackState = {
      returnTo,
      onErrorReturnTo,
      fromApp: true,
    };

    const redirect_uri = encodeURI(`${WEBAPP_URL}/api/integrations/stripepayment/callback`);
    const stripeConnectParams: Stripe.OAuthAuthorizeUrlParams = {
      client_id,
      scope: "read_write",
      response_type: "code",
      stripe_user: {
        email: user.email,
        first_name: user.name || undefined,
        country: process.env.NEXT_PUBLIC_IS_E2E ? "US" : undefined,
      },
      redirect_uri,
      state: JSON.stringify(state),
    };

    const params = z.record(z.any()).parse(stripeConnectParams);
    const query = stringify(params);

    const url = `https://connect.stripe.com/oauth/authorize?${query}`;

    return {
      redirect: {
        destination: url,
        permanent: false,
      },
    };
  } catch (error) {
    return {
      redirect: {
        destination: `${WEBAPP_URL}/apps/installed/payment?error=stripe_oauth_failed`,
        permanent: false,
      },
    };
  }
};
