import { stringify } from "node:querystring";
import { WEBAPP_URL_FOR_OAUTH } from "@calcom/lib/constants";
import type { NextApiRequest, NextApiResponse } from "next";
import { encodeOAuthState } from "../../_utils/oauth/encodeOAuthState";
import { BUBBLAV_URL } from "../lib/constants";
import { getBubblavAppKeys } from "../lib/getBubblavAppKeys";

/**
 * Start the "Sign in with BubblaV" OAuth flow.
 *
 * Cal.com is the OAuth client; BubblaV is the server. Returns the BubblaV
 * authorize URL — the Cal.com frontend redirects the installer there, where they
 * log in / pick a BubblaV website, then BubblaV redirects back to our callback
 * with an authorization code.
 *
 * BubblaV OAuth authorize endpoint:
 * https://www.bubblav.com/api/integrations/calcom/oauth/authorize
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { client_id } = await getBubblavAppKeys();
  if (!client_id) {
    return res.status(400).json({ message: "BubblaV client_id missing." });
  }

  const state = encodeOAuthState(req);

  const params = {
    client_id,
    redirect_uri: `${WEBAPP_URL_FOR_OAUTH}/api/integrations/bubblav/callback`,
    state,
    response_type: "code",
  };

  const authUrl = `${BUBBLAV_URL}/api/integrations/calcom/oauth/authorize?${stringify(params)}`;

  res.status(200).json({ url: authUrl });
}
