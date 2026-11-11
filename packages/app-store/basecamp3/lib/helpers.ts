import { prisma } from "@calcom/prisma";
import type { CredentialPayload } from "@calcom/types/Credential";
import { getBasecampKeys } from "./getBasecampKeys";
import type { BasecampToken } from "./types";

export const refreshAccessToken = async (credential: CredentialPayload) => {
  const { client_id: clientId, client_secret: clientSecret, user_agent: userAgent } = await getBasecampKeys();
  const credentialKey = credential.key as BasecampToken;
  const params = new URLSearchParams({
    type: "refresh",
    refresh_token: credentialKey.refresh_token,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const tokenInfo = await fetch(`https://launchpad.37signals.com/authorization/token?${params.toString()}`, {
    method: "POST",
    headers: { "User-Agent": userAgent },
  });
  const tokenInfoJson = await tokenInfo.json();
  tokenInfoJson["expires_at"] = Date.now() + 1000 * 3600 * 24 * 14;
  const newCredential = await prisma.credential.update({
    where: { id: credential.id },
    data: {
      key: { ...credentialKey, ...tokenInfoJson },
    },
  });
  return newCredential.key;
};
