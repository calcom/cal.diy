import type { AxiosError } from "axios";
import type { NextApiRequest, NextApiResponse } from "next";

import { WEBAPP_URL } from "@calcom/lib/constants";
import { getSafeRedirectUrl } from "@calcom/lib/getSafeRedirectUrl";
import prisma from "@calcom/prisma";

import getInstalledAppPath from "../../_utils/getInstalledAppPath";
import createOAuthAppCredential from "../../_utils/oauth/createOAuthAppCredential";
import { decodeOAuthState } from "../../_utils/oauth/decodeOAuthState";
import setDefaultConferencingApp from "../../_utils/setDefaultConferencingApp";
import config from "../config.json";
import { getKyzonCredentialKey, type KyzonCredentialKey } from "../lib/KyzonCredentialKey";
import { kyzonAxiosInstance } from "../lib/axios";
import { getKyzonAppKeys } from "../lib/getKyzonAppKeys";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const state = decodeOAuthState(req);
  const userId = req.session?.user.id;
  if (!userId) {
    return res.status(404).json({ message: "No user found" });
  }
  const { code, error, error_description } = req.query;

  if (error) {
    console.error("KYZON OAuth error from query parameters:", {
      error,
      error_description,
      hasState: !!(state?.onErrorReturnTo || state?.returnTo),
    });

    if (state?.onErrorReturnTo || state?.returnTo) {
      res.redirect(
        getSafeRedirectUrl(state.onErrorReturnTo) ??
          getSafeRedirectUrl(state?.returnTo) ??
          getInstalledAppPath({ variant: config.variant, slug: config.slug })
      );
      return;
    }

    let friendlyErrorMessage = "Connection to KYZON Space was cancelled or failed.";
    if (typeof error_description === "string") {
      friendlyErrorMessage = error_description;
    } else if (error === "access_denied") {
      friendlyErrorMessage =
        "Access to KYZON Space was denied. You can try connecting again if you'd like to use KYZON Space for your meetings.";
    } else if (typeof error === "string") {
      // Map common OAuth error codes to friendly messages
      switch (error) {
        case "invalid_request":
          friendlyErrorMessage = "There was an issue with the connection request. Please try again.";
          break;
        case "unauthorized_client":
          friendlyErrorMessage =
            "The KYZON Space integration is not properly configured. Please contact support.";
          break;
        case "invalid_scope":
          friendlyErrorMessage = "The requested permissions are not available. Please contact support.";
          break;
        case "server_error":
          friendlyErrorMessage =
            "KYZON Space is experiencing technical difficulties. Please try again later.";
          break;
        case "temporarily_unavailable":
          friendlyErrorMessage = "KYZON Space is temporarily unavailable. Please try again in a few minutes.";
          break;
        default:
          friendlyErrorMessage = `Connection failed: ${error}`;
      }
    }

    res.status(400).json({ message: friendlyErrorMessage });
    return;
  }

  if (typeof code !== "string") {
    console.error("KYZON OAuth callback missing authorization code:", {
      codeType: typeof code,
      hasState: !!(state?.onErrorReturnTo || state?.returnTo),
    });

    if (state?.onErrorReturnTo || state?.returnTo) {
      res.redirect(
        getSafeRedirectUrl(state.onErrorReturnTo) ??
          getSafeRedirectUrl(state?.returnTo) ??
          getInstalledAppPath({ variant: config.variant, slug: config.slug })
      );
      return;
    }

    const friendlyErrorMessage =
      "No authorization code was received from KYZON Space. Please try connecting again.";
    res.status(400).json({ message: friendlyErrorMessage });
    return;
  }

  const { client_id, client_secret, api_key } = await getKyzonAppKeys();

  let credentialKey: KyzonCredentialKey;

  try {
    const { data: authorizeResult } = await kyzonAxiosInstance.post<{
      access_token: string;
      refresh_token: string;
      token_type: "Bearer";
      expires_in: number;
      scope: string;
      error?: string;
      error_description?: string;
      error_uri?: string;
    }>(
      "/oauth/token",
      {
        grant_type: "authorization_code",
        code,
        client_id,
        client_secret,
        redirect_uri: `${WEBAPP_URL}/api/integrations/${config.slug}/callback`,
      },
      {
        headers: {
          "X-API-Key": api_key,
        },
      }
    );

    if (authorizeResult.error_description || authorizeResult.error) {
      if (state?.onErrorReturnTo || state?.returnTo) {
        res.redirect(
          getSafeRedirectUrl(state.onErrorReturnTo) ??
            getSafeRedirectUrl(state?.returnTo) ??
            getInstalledAppPath({ variant: config.variant, slug: config.slug })
        );
        return;
      }

      res
        .status(400)
        .json({ message: authorizeResult.error_description ?? authorizeResult.error });
      return;
    }

    const { data: profile } = await kyzonAxiosInstance.get<{
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      teamId: string;
    }>("/v1/oauth/me", {
      headers: {
        Authorization: `Bearer ${authorizeResult.access_token}`,
      },
    });

    credentialKey = getKyzonCredentialKey({
      ...authorizeResult,
      user_id: profile.id,
      team_id: profile.teamId,
    });
  } catch (error) {
    const axiosError = error as AxiosError<{
      error: string;
      error_description: string;
      error_uri?: string;
    }>;

    console.error("KYZON OAuth callback error:", {
      status: axiosError?.response?.status,
      message: axiosError?.message,
      code: axiosError?.code,
      hasState: !!(state?.onErrorReturnTo || state?.returnTo),
    });

    if (state?.onErrorReturnTo || state?.returnTo) {
      res.redirect(
        getSafeRedirectUrl(state.onErrorReturnTo) ??
          getSafeRedirectUrl(state?.returnTo) ??
          getInstalledAppPath({ variant: config.variant, slug: config.slug })
      );
      return;
    }

    let friendlyErrorMessage = "Unable to connect to KYZON Space. Please try again.";

    try {
      // Check for specific error descriptions from the API
      const apiErrorDescription = axiosError.response?.data?.error_description;
      const apiError = axiosError.response?.data?.error;

      if (apiErrorDescription) {
        friendlyErrorMessage = apiErrorDescription;
      } else if (apiError) {
        // Map common OAuth errors to user-friendly messages
        switch (apiError) {
          case "access_denied":
            friendlyErrorMessage = "Access was denied. Please try connecting to KYZON Space again.";
            break;
          case "invalid_grant":
            friendlyErrorMessage =
              "The authorization code is invalid or has expired. Please try connecting again.";
            break;
          case "invalid_client":
            friendlyErrorMessage =
              "There's a configuration issue with the KYZON Space integration. Please contact support.";
            break;
          case "invalid_request":
            friendlyErrorMessage = "There was an issue with the connection request. Please try again.";
            break;
          case "server_error":
            friendlyErrorMessage =
              "KYZON Space is temporarily unavailable. Please try again in a few minutes.";
            break;
          case "temporarily_unavailable":
            friendlyErrorMessage = "KYZON Space is currently undergoing maintenance. Please try again later.";
            break;
          default:
            friendlyErrorMessage = `Connection failed: ${apiError}`;
        }
      }

      // Handle network-level errors
      if (axiosError.code === "ECONNREFUSED" || axiosError.code === "ENOTFOUND") {
        friendlyErrorMessage =
          "Cannot reach KYZON Space servers. Please check your internet connection and try again.";
      } else if (axiosError.response?.status === 429) {
        friendlyErrorMessage = "Too many connection attempts. Please wait a moment and try again.";
      } else if (axiosError.response?.status === 503) {
        friendlyErrorMessage = "KYZON Space is temporarily unavailable. Please try again in a few minutes.";
      }
    } catch (e) {
      // Fallback to generic message if error parsing fails
      console.warn("Failed to parse KYZON OAuth error:", e);
    }

    res.status(400).json({ message: friendlyErrorMessage });
    return;
  }

  // With this we take care of no duplicate kyzonspacevideo key for a single user
  // when creating a room using deleteMany if there is already a kyzonspacevideo key
  await prisma.credential.deleteMany({
    where: {
      type: config.type,
      userId,
      appId: config.slug,
    },
  });

  await createOAuthAppCredential({ appId: config.slug, type: config.type }, credentialKey, req);

  if (state?.defaultInstall) {
    await setDefaultConferencingApp(userId, config.slug);
  }

  res.redirect(
    getSafeRedirectUrl(state?.returnTo) ?? getInstalledAppPath({ variant: config.variant, slug: config.slug })
  );
}
