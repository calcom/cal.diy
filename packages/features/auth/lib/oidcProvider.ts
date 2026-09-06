import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers/oauth";

export interface OidcProfile extends Record<string, unknown> {
  sub: string;
  name?: string;
  preferred_username?: string;
  email?: string;
  email_verified?: boolean;
  picture?: string;
}

/**
 * Generic OIDC provider for self-hosters using their own identity provider
 * (Authentik, Keycloak, Authelia, Okta, etc). next-auth ships thin per-product
 * wrappers (e.g. providers/authentik.js) that all follow this same shape, but
 * no generic factory - this is that generic version, discovering endpoints via
 * `.well-known/openid-configuration` (OpenID Connect Discovery 1.0) instead of hardcoding one vendor.
 */
export function createOidcProvider(
  options: Pick<OAuthUserConfig<OidcProfile>, "clientId" | "clientSecret"> & {
    issuer: string;
    providerName: string;
  }
): OAuthConfig<OidcProfile> {
  const normalizedIssuer = options.issuer.replace(/\/+$/, "");

  return {
    id: "oidc",
    name: options.providerName,
    type: "oauth",
    wellKnown: `${normalizedIssuer}/.well-known/openid-configuration`,
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    issuer: normalizedIssuer,
    authorization: { params: { scope: "openid email profile" } },
    checks: ["pkce", "state"],
    idToken: true,
    allowDangerousEmailAccountLinking: true,
    profile(profile) {
      return {
        // next-auth's User.id is augmented to `number` (the Prisma user id) in
        // types/next-auth.d.ts, but this callback only ever sees the IdP's `sub`
        // claim (a string) before Cal.diy's own signIn callback resolves and
        // overwrites it with the real database user. Google/Azure AD hit the same
        // mismatch; their vendored provider factories just aren't checked this
        // strictly because next-auth ships them as pre-compiled .js with generic
        // .d.ts signatures. Cast is intentional, not a type-safety gap.
        id: profile.sub as unknown as number,
        name: profile.name ?? profile.preferred_username ?? profile.email ?? profile.sub,
        email: profile.email,
        image: profile.picture ?? null,
      };
    },
  };
}
