export type OidcConfig = {
  discoveryUrl: string;
  clientId: string;
  clientSecret: string;
  /** Shown on the sign-in button: "Continue with <name>". */
  name: string;
};

type OidcEnv = {
  OIDC_ISSUER?: string;
  OIDC_CLIENT_ID?: string;
  OIDC_CLIENT_SECRET?: string;
  OIDC_NAME?: string;
};

/** Single sign-on through any OpenID Connect provider, turned on by its issuer and client settings. */
export function oidcConfigFromEnv(env: OidcEnv): OidcConfig | null {
  const issuer = env.OIDC_ISSUER?.trim();
  const clientId = env.OIDC_CLIENT_ID?.trim();
  const clientSecret = env.OIDC_CLIENT_SECRET?.trim();
  if (!issuer || !clientId || !clientSecret) return null;
  // Accept the issuer as providers show it, with or without the discovery path or a trailing slash.
  const base = issuer.replace(/\/\.well-known\/openid-configuration\/?$/, "").replace(/\/+$/, "");
  return {
    discoveryUrl: `${base}/.well-known/openid-configuration`,
    clientId,
    clientSecret,
    name: env.OIDC_NAME?.trim() || "SSO",
  };
}
