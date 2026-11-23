import { createHmac, randomUUID } from "node:crypto";
import process from "node:process";
import type { NextApiRequest } from "next";
import type { IntegrationOAuthCallbackState } from "../../types";

/**
 * Signs an OAuth callback state with an HMAC nonce bound to the user session so
 * that decodeOAuthState can verify the state was created by us for this user.
 */
export function signOAuthState(state: IntegrationOAuthCallbackState, userId?: number): string {
  const signedState = { ...state };

  if (userId && process.env.NEXTAUTH_SECRET) {
    signedState.nonce = randomUUID();
    signedState.nonceHash = createHmac("sha256", process.env.NEXTAUTH_SECRET)
      .update(`${signedState.nonce}:${userId}`)
      .digest("hex");
  }

  return JSON.stringify(signedState);
}

export function encodeOAuthState(req: NextApiRequest) {
  if (typeof req.query.state !== "string") {
    return undefined;
  }
  const state: IntegrationOAuthCallbackState = JSON.parse(req.query.state);

  return signOAuthState(state, req.session?.user?.id);
}
