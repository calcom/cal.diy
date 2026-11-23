import type { NextApiRequest, NextApiResponse } from "next";
import { stringify } from "node:querystring";

import { WEBAPP_URL } from "@calcom/lib/constants";
import prisma from "@calcom/prisma";

import { signOAuthState } from "../../_utils/oauth/encodeOAuthState";
import getAppKeysFromSlug from "../../_utils/getAppKeysFromSlug";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    // Get user
    await prisma.user.findFirstOrThrow({
      where: {
        id: req.session?.user?.id,
      },
      select: {
        id: true,
      },
    });

    let clientId = "";
    let baseUrl = "";
    const appKeys = await getAppKeysFromSlug("tandem");
    if (typeof appKeys.client_id === "string") clientId = appKeys.client_id;
    if (typeof appKeys.base_url === "string") baseUrl = appKeys.base_url;
    if (!clientId) return res.status(400).json({ message: "Tandem client_id missing." });
    if (!baseUrl) return res.status(400).json({ message: "Tandem base_url missing." });

    const redirect_uri = encodeURI(`${WEBAPP_URL}/api/integrations/tandemvideo/callback`);

    const params = {
      client_id: clientId,
      redirect_uri,
      state: signOAuthState({ fromApp: false }, req.session?.user?.id),
    };
    const query = stringify(params);
    const url = `${baseUrl}/oauth/approval?${query}`;
    res.status(200).json({ url });
  }
}
