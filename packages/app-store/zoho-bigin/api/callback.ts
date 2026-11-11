import axios from "axios";
import type { NextApiRequest, NextApiResponse } from "next";
import qs from "qs";

import { WEBAPP_URL } from "@calcom/lib/constants";
import { getSafeRedirectUrl } from "@calcom/lib/getSafeRedirectUrl";

import getAppKeysFromSlug from "../../_utils/getAppKeysFromSlug";
import getInstalledAppPath from "../../_utils/getInstalledAppPath";
import createOAuthAppCredential from "../../_utils/oauth/createOAuthAppCredential";
import { decodeOAuthState } from "../../_utils/oauth/decodeOAuthState";
import appConfig from "../config.json";

function isAuthorizedAccountsServerUrl(accountsServer: string) {
  // As per https://www.zoho.com/crm/developer/docs/api/v6/multi-dc.html#:~:text=US:%20https://accounts.zoho,https://accounts.zohocloud.ca&text=The%20%22location=us%22%20parameter,domain%20in%20all%20API%20endpoints.&text=You%20must%20make%20the%20authorization,.zoho.com.cn.
  const authorizedAccountServers = [
    "https://accounts.zoho.com",
    "https://accounts.zoho.eu",
    "https://accounts.zoho.in",
    "https://accounts.zoho.com.cn",
    "https://accounts.zoho.jp",
    "https://accounts.zohocloud.ca",
    "https://accounts.zoho.com.au",
  ];
  return authorizedAccountServers.includes(accountsServer);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { code, "accounts-server": accountsServer } = req.query;
  const state = decodeOAuthState(req);

  if (code && typeof code !== "string") {
    res.status(400).json({ message: "`code` must be a string" });
    return;
  }

  if (!accountsServer || typeof accountsServer !== "string") {
    res.status(400).json({ message: "`accounts-server` is required and must be a string" });
    return;
  }

  if (!isAuthorizedAccountsServerUrl(accountsServer)) {
    res.status(400).json({ message: "`accounts-server` is not authorized" });
    return;
  }

  if (!req.session?.user?.id) {
    res.status(401).json({ message: "You must be logged in to do this" });
    return;
  }

  const appKeys = await getAppKeysFromSlug(appConfig.slug);

  const clientId = typeof appKeys.client_id === "string" ? appKeys.client_id : "";
  const clientSecret = typeof appKeys.client_secret === "string" ? appKeys.client_secret : "";

  if (!clientId) return res.status(400).json({ message: "Zoho Bigin client_id missing." });
  if (!clientSecret) return res.status(400).json({ message: "Zoho Bigin client_secret missing." });

  const accountsUrl = `${accountsServer}/oauth/v2/token`;
  const redirectUri = `${WEBAPP_URL}/api/integrations/${appConfig.slug}/callback`;

  const formData = {
    client_id: clientId,
    client_secret: clientSecret,
    code: code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  };

  const tokenInfo = await axios.post(accountsUrl, qs.stringify(formData), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
  });

  tokenInfo.data.expiryDate = Math.round(Date.now() + tokenInfo.data.expires_in * 1000);
  tokenInfo.data.accountServer = accountsServer;

  await createOAuthAppCredential({ appId: appConfig.slug, type: appConfig.type }, tokenInfo.data, req);

  res.redirect(
    getSafeRedirectUrl(state?.returnTo) ??
      getInstalledAppPath({ variant: appConfig.variant, slug: appConfig.slug })
  );
}
