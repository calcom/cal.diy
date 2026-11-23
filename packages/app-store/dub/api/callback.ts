import type { NextApiRequest, NextApiResponse } from "next";

import { WEBAPP_URL } from "@calcom/lib/constants";
import { getSafeRedirectUrl } from "@calcom/lib/getSafeRedirectUrl";
import { HttpError } from "@calcom/lib/http-error";

import getInstalledAppPath from "../../_utils/getInstalledAppPath";
import getParsedAppKeysFromSlug from "../../_utils/getParsedAppKeysFromSlug";
import createOAuthAppCredential from "../../_utils/oauth/createOAuthAppCredential";
import { decodeOAuthState } from "../../_utils/oauth/decodeOAuthState";
import { dubAppKeysSchema } from "../lib/utils";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { code } = req.query;

  const state = decodeOAuthState(req);
  if (!state) {
    return res.status(401).json({ message: "Invalid OAuth state" });
  }

  if (typeof code !== "string") {
    if (state?.onErrorReturnTo || state?.returnTo) {
      res.redirect(
        getSafeRedirectUrl(state.onErrorReturnTo) ??
          getSafeRedirectUrl(state?.returnTo) ??
          `${WEBAPP_URL}/apps/installed`
      );
      return;
    }
    throw new HttpError({ statusCode: 400, message: "`code` must be a string" });
  }

  if (!req.session?.user?.id) {
    throw new HttpError({ statusCode: 401, message: "You must be logged in to do this" });
  }

  const { client_id, redirect_uris, client_secret } = await getParsedAppKeysFromSlug("dub", dubAppKeysSchema);

  const codeExchangeUrl = `https://api.dub.co/oauth/token`;

  const result = await fetch(codeExchangeUrl, {
    method: "POST",
    body: new URLSearchParams({
      code,
      client_id,
      redirect_uri: redirect_uris,
      client_secret,
      grant_type: "authorization_code",
    }).toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (result.status !== 200) {
    let errorMessage = "Something wrong with Dub Api";
    try {
      const responseBody = await result.json();
      if (typeof responseBody?.error?.message === "string") {
        errorMessage = responseBody.error.message;
      }
    } catch (err) {
      return;
    }

    return res.status(400).json({ message: errorMessage });
  }

  const responseBody = await result.json();

  responseBody.expiry_date = Math.round(Date.now() + responseBody.expires_in * 1000);
  delete responseBody.expires_in;

  await createOAuthAppCredential({ appId: "dub", type: "dub" }, responseBody, req);

  res.redirect(
    getSafeRedirectUrl(state?.returnTo) ?? getInstalledAppPath({ variant: "analytics", slug: "dub" })
  );
}
