import type { NextApiRequest, NextApiResponse } from "next";

import { WEBAPP_URL } from "@calcom/lib/constants";
import prisma from "@calcom/prisma";

import getAppKeysFromSlug from "../../_utils/getAppKeysFromSlug";
import getInstalledAppPath from "../../_utils/getInstalledAppPath";
import { decodeOAuthState } from "../../_utils/oauth/decodeOAuthState";
import appConfig from "../config.json";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { code } = req.query;
  const state = decodeOAuthState(req);
  if (!state) {
    return res.status(401).json({ message: "Invalid OAuth state" });
  }
  const { client_id, client_secret, user_agent } = await getAppKeysFromSlug("basecamp3");

  const redirectUri = `${WEBAPP_URL}/api/integrations/basecamp3/callback`;

  const params = new URLSearchParams({
    type: "web_server",
    client_id: client_id as string,
    client_secret: client_secret as string,
    redirect_uri: redirectUri,
    code: code as string,
  });
  // gets access token
  const accessTokenResponse = await fetch(
    `https://launchpad.37signals.com/authorization/token?${params.toString()}`,
    {
      method: "POST",
    }
  );

  if (accessTokenResponse.status !== 200) {
    let errorMessage = "Error with Basecamp 3 API";
    try {
      const responseBody = await accessTokenResponse.json();
      errorMessage = responseBody.error;
    } catch (e) {}

    res.status(400).json({ message: errorMessage });
    return;
  }

  const tokenResponseBody = await accessTokenResponse.json();

  if (tokenResponseBody.error) {
    res.status(400).json({ message: tokenResponseBody.error });
    return;
  }
  // expiry date of 2 weeks
  tokenResponseBody["expires_at"] = Date.now() + 1000 * 3600 * 24 * 14;
  // get user details such as projects and account info
  const userAuthResponse = await fetch("https://launchpad.37signals.com/authorization.json", {
    headers: {
      "User-Agent": user_agent as string,
      Authorization: `Bearer ${tokenResponseBody.access_token}`,
    },
  });
  if (userAuthResponse.status !== 200) {
    let errorMessage = "Error with Basecamp 3 API";
    try {
      const body = await userAuthResponse.json();
      errorMessage = body.error;
    } catch (e) {}

    res.status(400).json({ message: errorMessage });
    return;
  }

  const authResponseBody = await userAuthResponse.json();
  const userId = req.session?.user.id;
  if (!userId) {
    return res.status(404).json({ message: "No user found" });
  }

  await prisma.user.update({
    where: {
      id: req.session?.user.id,
    },
    data: {
      credentials: {
        create: {
          type: appConfig.type,
          key: { ...tokenResponseBody, account: authResponseBody.accounts[0] },
          appId: appConfig.slug,
        },
      },
    },
  });

  res.redirect(getInstalledAppPath({ variant: appConfig.variant, slug: appConfig.slug }));
}
