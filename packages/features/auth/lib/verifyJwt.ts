import process from "node:process";
import { WEBSITE_URL } from "@calcom/lib/constants";
import { type JWTVerifyResult, jwtVerify } from "jose";

/** Verifies a token created by `signJwt` for the 2FA step of an identity provider login. */
const verifyJwt = (jwt: string): Promise<JWTVerifyResult> => {
  const secret = new TextEncoder().encode(process.env.CALENDSO_ENCRYPTION_KEY);

  return jwtVerify(jwt, secret, {
    issuer: WEBSITE_URL,
    audience: `${WEBSITE_URL}/auth/login`,
    algorithms: ["HS256"],
  });
};

export default verifyJwt;
