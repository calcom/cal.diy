import type { NextApiRequest, NextApiResponse } from "next";

import { WEBAPP_URL } from "@calcom/lib/constants";
import { defaultHandler } from "@calcom/lib/server/defaultHandler";
import { defaultResponder } from "@calcom/lib/server/defaultResponder";

import { encodeOAuthState } from "../../_utils/oauth/encodeOAuthState";
import config from "../config.json";
import { kyzonBaseUrl } from "../lib/axios";
import { getKyzonAppKeys } from "../lib/getKyzonAppKeys";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Get user
  const user = req?.session?.user;
  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { client_id } = await getKyzonAppKeys();
  const state = encodeOAuthState(req);

  const query = new URLSearchParams();
  query.set("response_type", "code");
  query.set("client_id", client_id);
  query.set("redirect_uri", `${WEBAPP_URL}/api/integrations/${config.slug}/callback`);
  query.set("scope", "meetings:write calendar:write profile:read");
  if (state) {
    query.set("state", state);
  }

  const url = `${kyzonBaseUrl}/oauth/authorize?${query.toString()}`;

  return res.status(200).json({ url });
}

export default defaultHandler({
  GET: Promise.resolve({ default: defaultResponder(handler) }),
});
