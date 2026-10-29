import type { NextApiRequest, NextApiResponse } from "next";

import { WEBAPP_URL_FOR_OAUTH } from "@calcom/lib/constants";
import { getSafeRedirectUrl } from "@calcom/lib/getSafeRedirectUrl";
import prisma from "@calcom/prisma";

import getInstalledAppPath from "../../_utils/getInstalledAppPath";
import createOAuthAppCredential from "../../_utils/oauth/createOAuthAppCredential";
import { decodeOAuthState } from "../../_utils/oauth/decodeOAuthState";
import { getZoomAppKeys } from "../lib";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const state = decodeOAuthState(req);
  const { code } = req.query;
  const { client_id, client_secret } = await getZoomAppKeys();

  const redirectUri = encodeURI(`${WEBAPP_URL_FOR_OAUTH}/api/integrations/zoomvideo/callback`);
  const authHeader = `Basic ${Buffer.from(`${client_id}:${client_secret}`).toString("base64")}`;
  const result = await fetch(
    `https://zoom.us/oauth/token?grant_type=authorization_code&code=${code}&redirect_uri=${redirectUri}`,
    {
      method: "POST",
      headers: {
        Authorization: authHeader,
      },
    }
  );

  if (result.status !== 200) {
    let errorMessage = "Something is wrong with Zoom API";
    try {
      const responseBody = await result.json();
      errorMessage = responseBody.error;
    } catch {
      errorMessage = await result.clone().text();
    }

    res.status(400).json({ message: errorMessage });
    return;
  }

  const responseBody = await result.json();

  if (responseBody.error) {
    res.status(400).json({ message: responseBody.error });
    return;
  }

  responseBody.expiry_date = Math.round(Date.now() + responseBody.expires_in * 1000);
  delete responseBody.expires_in;

  const userId = req.session?.user.id;
  if (!userId) {
    return res.status(404).json({ message: "No user found" });
  }
  /**
   * With this we take care of no duplicate zoom_video key for a single user
   * when creating a video room we only do findFirst so the if they have more than 1
   * others get ignored
   * */
  const existingCredentialZoomVideo = await prisma.credential.findMany({
    select: {
      id: true,
    },
    where: {
      type: "zoom_video",
      userId: req.session?.user.id,
      appId: "zoom",
    },
  });

  // Making sure we only delete zoom_video
  const credentialIdsToDelete = existingCredentialZoomVideo.map((item) => item.id);
  if (credentialIdsToDelete.length > 0) {
    await prisma.credential.deleteMany({
      where: {
        id: { in: credentialIdsToDelete },
      },
    });
  }

  await createOAuthAppCredential({ appId: "zoom", type: "zoom_video" }, responseBody, req);

  res.redirect(
    getSafeRedirectUrl(state?.returnTo) ?? getInstalledAppPath({ variant: "conferencing", slug: "zoom" })
  );
}
