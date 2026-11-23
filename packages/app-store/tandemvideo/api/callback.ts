import type { NextApiRequest, NextApiResponse } from "next";

import { getSafeRedirectUrl } from "@calcom/lib/getSafeRedirectUrl";
import prisma from "@calcom/prisma";

import getAppKeysFromSlug from "../../_utils/getAppKeysFromSlug";
import getInstalledAppPath from "../../_utils/getInstalledAppPath";
import createOAuthAppCredential from "../../_utils/oauth/createOAuthAppCredential";
import { decodeOAuthState } from "../../_utils/oauth/decodeOAuthState";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!req.query.code) {
    res.status(401).json({ message: "Missing code" });
    return;
  }

  const code = req.query.code as string;
  const state = decodeOAuthState(req);
  if (!state) {
    return res.status(401).json({ message: "Invalid OAuth state" });
  }

  let clientId = "";
  let clientSecret = "";
  let baseUrl = "https://tandem.chat";
  const appKeys = await getAppKeysFromSlug("tandem");
  if (typeof appKeys.client_id === "string") clientId = appKeys.client_id;
  if (typeof appKeys.client_secret === "string") clientSecret = appKeys.client_secret;
  if (typeof appKeys.base_url === "string") baseUrl = appKeys.base_url;
  if (!clientId) return res.status(400).json({ message: "Tandem client_id missing." });
  if (!clientSecret) return res.status(400).json({ message: "Tandem client_secret missing." });
  if (!baseUrl) return res.status(400).json({ message: "Tandem base_url missing." });

  const result = await fetch(`${baseUrl}/api/v1/oauth/v2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code, client_id: clientId, client_secret: clientSecret }),
  });

  const responseBody = await result.json();

  const userId = req.session?.user.id;
  if (!userId) {
    return res.status(404).json({ message: "No user found" });
  }

  const existingCredentialTandemVideo = await prisma.credential.findMany({
    select: {
      id: true,
    },
    where: {
      type: "tandem_video",
      userId: req.session?.user.id,
      appId: "tandem",
    },
  });

  const credentialIdsToDelete = existingCredentialTandemVideo.map((item) => item.id);
  if (credentialIdsToDelete.length > 0) {
    await prisma.credential.deleteMany({ where: { id: { in: credentialIdsToDelete }, userId } });
  }
  if (result.ok) {
    responseBody.expiry_date = Math.round(Date.now() + responseBody.expires_in * 1000);
    delete responseBody.expires_in;

    await createOAuthAppCredential({ appId: "tandem", type: "tandem_video" }, responseBody, req);

    res.redirect(
      getSafeRedirectUrl(state?.returnTo) ?? getInstalledAppPath({ variant: "conferencing", slug: "tandem" })
    );
  }
}
