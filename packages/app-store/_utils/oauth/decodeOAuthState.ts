import { createHmac, timingSafeEqual } from "node:crypto";
import process from "node:process";
import type { NextApiRequest } from "next";
import type { IntegrationOAuthCallbackState } from "../../types";

/**
 * Decodes an OAuth callback state. The state must carry a nonce + HMAC nonceHash
 * bound to the current session user (see signOAuthState) - unsigned or tampered
 * states are rejected for every app, no exemptions.
 */
export function decodeOAuthState(req: NextApiRequest) {
  if (typeof req.query.state !== "string") {
    return undefined;
  }
  let state: IntegrationOAuthCallbackState;
  try {
    state = JSON.parse(req.query.state);
  } catch {
    return undefined;
  }

  if (!state.nonce || !state.nonceHash) {
    return undefined;
  }

  const userId = req.session?.user?.id;
  if (!userId || !process.env.NEXTAUTH_SECRET) {
    return undefined;
  }
  const expected = createHmac("sha256", process.env.NEXTAUTH_SECRET)
    .update(`${state.nonce}:${userId}`)
    .digest();
  const actual = Buffer.from(state.nonceHash, "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return undefined;
  }

  return state;
}
