import type { NextApiRequest, NextApiResponse } from "next";

import { WEBAPP_URL_FOR_OAUTH } from "@calcom/lib/constants";
import { getSafeRedirectUrl } from "@calcom/lib/getSafeRedirectUrl";
import prisma from "@calcom/prisma";

import getInstalledAppPath from "../../_utils/getInstalledAppPath";
import createOAuthAppCredential from "../../_utils/oauth/createOAuthAppCredential";
import { decodeOAuthState } from "../../_utils/oauth/decodeOAuthState";
import config from "../config.json";
import { getWebexAppKeys } from "../lib/getWebexAppKeys";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { code } = req.query;
  const { client_id, client_secret } = await getWebexAppKeys();
  const state = decodeOAuthState(req);
  if (!state) {
    return res.status(401).json({ message: "Invalid OAuth state" });
  }

  /** @link https://developer.webex.com/docs/integrations#getting-an-access-token **/

  const redirectUri = encodeURI(`${WEBAPP_URL_FOR_OAUTH}/api/integrations/${config.slug}/callback`);
  const params = new URLSearchParams([
    ["grant_type", "authorization_code"],
    ["client_id", client_id],
    ["client_secret", client_secret],
    ["code", code as string],
    ["redirect_uri", redirectUri],
  ]);

  const options = {
    method: "POST",
    headers: {
      "Content-type": "application/x-www-form-urlencoded",
    },
    body: params,
  };

  const result = await fetch("https://webexapis.com/v1/access_token", options);

  if (result.status !== 200) {
    let errorMessage = "Something is wrong with Webex API";
    try {
      const responseBody = await result.json();
      errorMessage = responseBody.message;
    } catch (e) {}

    res.status(400).json({ message: errorMessage });
    return;
  }

  const responseBody = await result.json();

  if (responseBody.message) {
    res.status(400).json({ message: responseBody.message });
    return;
  }

  responseBody.expiry_date = Math.round(Date.now() + responseBody.expires_in * 1000);
  delete responseBody.expires_in;

  const userId = req.session?.user.id;
  if (!userId) {
    return res.status(404).json({ message: "No user found" });
  }
  /**
   * With this we take care of no duplicate webex key for a single user
   * when creating a video room we only do findFirst so the if they have more than 1
   * others get ignored
   * */
  const existingCredentialWebexVideo = await prisma.credential.findMany({
    select: {
      id: true,
    },
    where: {
      type: config.type,
      userId: req.session?.user.id,
      appId: config.slug,
    },
  });

  // Making sure we only delete webex_video
  const credentialIdsToDelete = existingCredentialWebexVideo.map((item) => item.id);
  if (credentialIdsToDelete.length > 0) {
    await prisma.credential.deleteMany({ where: { id: { in: credentialIdsToDelete }, userId } });
  }

  await createOAuthAppCredential({ appId: config.slug, type: config.type }, responseBody, req);

  res.redirect(
    getSafeRedirectUrl(state?.returnTo) ?? getInstalledAppPath({ variant: config.variant, slug: config.slug })
  );
}
