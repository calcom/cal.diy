import process from "node:process";
import { WEBSITE_URL } from "@calcom/lib/constants";
import { jwtVerify, SignJWT } from "jose";

/**
 * Signs a short-lived TOTP verification JWT for SSO authentication flows.
 *
 * @param payload - An object containing the authenticated user's email address.
 * @returns A signed JWT string valid for 2 minutes with HS256 algorithm.
 * @throws Error if CALENDSO_ENCRYPTION_KEY environment variable is not defined.
 */
export const signJwt = async (payload: { email: string }): Promise<string> => {
  if (!process.env.CALENDSO_ENCRYPTION_KEY) {
    throw new Error("Missing CALENDSO_ENCRYPTION_KEY environment variable");
  }
  const secret = new TextEncoder().encode(process.env.CALENDSO_ENCRYPTION_KEY);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.email)
    .setIssuedAt()
    .setIssuer(WEBSITE_URL)
    .setAudience(`${WEBSITE_URL}/auth/login`)
    .setExpirationTime("2m")
    .sign(secret);
};

/**
 * Verifies a TOTP verification JWT during credentials authentication.
 *
 * @param jwt - The JWT string to verify against CALENDSO_ENCRYPTION_KEY.
 * @returns The verified JWT payload and protected header.
 * @throws Error if CALENDSO_ENCRYPTION_KEY is missing or the token is invalid/expired.
 */
export const verifyTotpJwt = async (jwt: string): Promise<Awaited<ReturnType<typeof jwtVerify>>> => {
  if (!process.env.CALENDSO_ENCRYPTION_KEY) {
    throw new Error("Missing CALENDSO_ENCRYPTION_KEY environment variable");
  }
  const secret = new TextEncoder().encode(process.env.CALENDSO_ENCRYPTION_KEY);
  return jwtVerify(jwt, secret, {
    issuer: WEBSITE_URL,
    audience: `${WEBSITE_URL}/auth/login`,
    algorithms: ["HS256"],
    requiredClaims: ["exp", "sub"],
  });
};

export default signJwt;
