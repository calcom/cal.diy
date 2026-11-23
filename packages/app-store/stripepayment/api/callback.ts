import { stringify } from "node:querystring";
import { getSafeRedirectUrl } from "@calcom/lib/getSafeRedirectUrl";
import type { Prisma } from "@calcom/prisma/client";
import type { NextApiRequest, NextApiResponse } from "next";
import getInstalledAppPath from "../../_utils/getInstalledAppPath";
import createOAuthAppCredential from "../../_utils/oauth/createOAuthAppCredential";
import { decodeOAuthState } from "../../_utils/oauth/decodeOAuthState";
import type { StripeData } from "../lib/server";
import stripe from "../lib/server";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { code, error, error_description } = req.query;
  const state = decodeOAuthState(req);
  if (!state) {
    return res.status(401).json({ message: "Invalid OAuth state" });
  }

  if (error) {
    if (error === "access_denied") {
      return res.redirect(getSafeRedirectUrl(state?.onErrorReturnTo) ?? "/apps/installed/payment");
    }
    const query = stringify({ error, error_description });
    return res.redirect(`/apps/installed?${query}`);
  }

  if (!req.session?.user?.id) {
    return res.status(401).json({ message: "You must be logged in to do this" });
  }

  const response = await stripe.oauth.token({
    grant_type: "authorization_code",
    code: code?.toString(),
  });

  const data: StripeData = { ...response, default_currency: "" };
  if (response.stripe_user_id) {
    const account = await stripe.accounts.retrieve(response.stripe_user_id);
    data.default_currency = account.default_currency;
  }

  await createOAuthAppCredential(
    { appId: "stripe", type: "stripe_payment" },
    data as unknown as Prisma.InputJsonObject,
    req
  );

  res.redirect(
    getSafeRedirectUrl(state?.returnTo) ?? getInstalledAppPath({ variant: "payment", slug: "stripe" })
  );
}
