import { WEBAPP_URL, WEBAPP_URL_FOR_OAUTH } from "@calcom/lib/constants";
import { getSafeRedirectUrl } from "@calcom/lib/getSafeRedirectUrl";
import logger from "@calcom/lib/logger";
import type { NextApiRequest, NextApiResponse } from "next";
import getInstalledAppPath from "../../_utils/getInstalledAppPath";
import createOAuthAppCredential from "../../_utils/oauth/createOAuthAppCredential";
import { decodeOAuthState } from "../../_utils/oauth/decodeOAuthState";
import { BUBBLAV_URL } from "../lib/constants";
import { getBubblavAppKeys } from "../lib/getBubblavAppKeys";

const log = logger.getSubLogger({ prefix: ["[[bubblav/api/callback]"] });

/**
 * Complete the "Sign in with BubblaV" flow: exchange the authorization code for
 * BubblaV access/refresh tokens, store them as a Cal.com credential, and
 * redirect to the installed-apps page.
 *
 * BubblaV token endpoint:
 * https://www.bubblav.com/api/integrations/calcom/oauth/token
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { code } = req.query;

  if (!code || typeof code !== "string") {
    return res.status(400).json({ message: "`code` is required and must be a string" });
  }
  if (!req.session?.user?.id) {
    return res.status(401).json({ message: "You must be logged in to do this" });
  }

  const { client_id: clientId, client_secret: clientSecret } = await getBubblavAppKeys();

  if (!clientId) return res.status(400).json({ message: "BubblaV client_id missing." });
  if (!clientSecret) return res.status(400).json({ message: "BubblaV client_secret missing." });

  // redirect_uri MUST match the one used in api/add.ts (the Cal.com callback).
  const redirectUri = `${WEBAPP_URL_FOR_OAUTH}/api/integrations/bubblav/callback`;
  const tokenUrl = `${BUBBLAV_URL}/api/integrations/calcom/oauth/token`;

  let response: Response;
  try {
    response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
      // Don't follow redirects — a 3xx here means the BubblaV deployment is
      // intercepting the server-to-server call (e.g. Vercel Deployment
      // Protection / SSO), which can't be completed headlessly. Surface it.
      redirect: "manual",
    });
  } catch (err) {
    log.error("BubblaV token request failed (network)", { tokenUrl, err: String(err) });
    return res.redirect(
      `/apps/installed?error=${encodeURIComponent(
        `Could not reach the BubblaV token endpoint (${tokenUrl}). Verify that the BubblaV service is reachable.`
      )}`
    );
  }

  // A redirect = the BubblaV deployment is gated (e.g. Vercel Deployment
  // Protection / SSO). Server-to-server calls can't pass it, so give an
  // actionable error instead of following it to an HTML login page.
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location") || "";
    log.error("BubblaV token endpoint redirected (deployment protection?)", {
      tokenUrl,
      status: response.status,
      location,
    });
    return res.redirect(
      `/apps/installed?error=${encodeURIComponent(
        `The BubblaV deployment redirected the token request (HTTP ${response.status} → ${location}). If it is a Vercel preview, disable Deployment Protection (Vercel Authentication) in the project settings so server-to-server API calls can reach it.`
      )}`
    );
  }

  // Read text first so a non-JSON response (e.g. an HTML 404 from a wrong URL)
  // doesn't crash the handler with "Unexpected token '<'".
  const responseText = await response.text();
  let responseBody: {
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };
  try {
    responseBody = JSON.parse(responseText);
  } catch {
    log.error("BubblaV token endpoint returned non-JSON", {
      tokenUrl,
      status: response.status,
      preview: responseText.slice(0, 200),
    });
    return res.redirect(
      `/apps/installed?error=${encodeURIComponent(
        `BubblaV token endpoint (${tokenUrl}) returned status ${response.status} with a non-JSON response. Make sure the BubblaV deployment has the Cal.com integration deployed.`
      )}`
    );
  }

  if (response.status !== 200 || !responseBody.access_token) {
    log.error("BubblaV token exchange failed", responseBody);
    return res.redirect(`/apps/installed?error=${encodeURIComponent(JSON.stringify(responseBody))}`);
  }

  // Store the BubblaV tokens as the app credential (keyed to the user/team).
  // Must be awaited: the success redirect below can otherwise race the write,
  // and a failure here must surface to the installer rather than be swallowed.
  try {
    await createOAuthAppCredential(
      { appId: "bubblav", type: "bubblav_automation" },
      {
        access_token: responseBody.access_token,
        refresh_token: responseBody.refresh_token,
      },
      req
    );
  } catch (err) {
    log.error("Failed to persist BubblaV credential", { err: String(err) });
    return res.redirect(
      `/apps/installed?error=${encodeURIComponent(
        "Connected to BubblaV but failed to save the credential. Please try installing again."
      )}`
    );
  }

  decodeOAuthState(req);

  res.redirect(
    getSafeRedirectUrl(`${WEBAPP_URL}/apps/installed/automation?hl=bubblav`) ??
      getInstalledAppPath({ variant: "automation", slug: "bubblav" })
  );
}
