import prisma from "@calcom/prisma";

import {
  getKyzonCredentialKey,
  kyzonCredentialKeySchema,
  type KyzonCredentialKey,
} from "./KyzonCredentialKey";
import { kyzonAxiosInstance } from "./axios";
import { getKyzonAppKeys } from "./getKyzonAppKeys";

const inFlightRefresh = new Map<number, Promise<KyzonCredentialKey | null>>();

export async function refreshKyzonToken(credentialId: number): Promise<KyzonCredentialKey | null> {
  const existing = inFlightRefresh.get(credentialId);
  if (existing) return existing;

  const refreshRequest = _refreshKyzonToken(credentialId);

  inFlightRefresh.set(credentialId, refreshRequest);
  return await refreshRequest;
}

async function _refreshKyzonToken(credentialId: number): Promise<KyzonCredentialKey | null> {
  try {
    const credential = await prisma.credential.findUnique({
      where: { id: credentialId },
      select: {
        key: true,
      },
    });

    if (!credential?.key) {
      return null;
    }

    const currentKey = kyzonCredentialKeySchema.parse(credential.key);

    if (!currentKey.refresh_token) {
      console.warn(
        `KYZON token refresh failed: No refresh token available for credential ${credentialId}. User may need to reconnect to KYZON Space.`
      );
      return null;
    }

    const { client_id, client_secret, api_key } = await getKyzonAppKeys();

    const { data: newTokens } = await kyzonAxiosInstance.post<{
      access_token: string;
      refresh_token: string;
      token_type: "Bearer";
      expires_in: number;
      scope: string;
    }>(
      "/oauth/token",
      {
        grant_type: "refresh_token",
        refresh_token: currentKey.refresh_token,
        client_id,
        client_secret,
      },
      {
        headers: {
          "X-API-Key": api_key,
        },
      }
    );

    const newCredentialKey = getKyzonCredentialKey({ ...currentKey, ...newTokens });

    // Update the credential with new tokens
    await prisma.credential.update({
      where: { id: credentialId },
      data: {
        key: newCredentialKey,
      },
    });

    return newCredentialKey;
  } catch (error) {
    const err = error as any;

    // Provide more detailed logging based on error type
    let logLevel = "error";
    let errorContext = "Failed to refresh KYZON token";

    if (err?.response?.status === 400) {
      errorContext = "KYZON refresh token is invalid or expired. User needs to reconnect.";
    } else if (err?.response?.status === 401) {
      errorContext = "KYZON authentication failed during token refresh. User needs to reconnect.";
    } else if (err?.response?.status === 403) {
      errorContext = "KYZON token refresh not allowed. Check app permissions.";
    } else if (err?.response?.status >= 500) {
      errorContext = "KYZON server error during token refresh. Will retry on next request.";
      logLevel = "warn"; // Server errors are temporary
    } else if (err?.code === "ECONNREFUSED" || err?.code === "ENOTFOUND") {
      errorContext = "Cannot connect to KYZON servers for token refresh. Will retry on next request.";
      logLevel = "warn"; // Network errors are temporary
    }

    if (logLevel === "error") {
      console.error(errorContext, {
        credentialId,
        status: err?.response?.status,
        message: err?.message,
        code: err?.code,
      });
    } else {
      console.warn(errorContext, {
        credentialId,
        status: err?.response?.status,
        message: err?.message,
        code: err?.code,
      });
    }

    return null;
  } finally {
    inFlightRefresh.delete(credentialId);
  }
}

export function isTokenExpired(token: KyzonCredentialKey): boolean {
  const now = Date.now();

  if (!token || typeof token.expiry_date !== "number" || !Number.isFinite(token.expiry_date)) {
    return true;
  }

  // expiry_date already includes a 60s skew; no extra buffer here
  return token.expiry_date <= now;
}
