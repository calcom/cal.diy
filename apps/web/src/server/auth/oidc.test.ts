import { describe, expect, it } from "vitest";
import { oidcConfigFromEnv } from "./oidc";

const env = {
  OIDC_ISSUER: "https://auth.example.com/application/o/cal/",
  OIDC_CLIENT_ID: "cal",
  OIDC_CLIENT_SECRET: "secret",
};

describe("oidcConfigFromEnv", () => {
  it("is off unless the issuer, client id and client secret are all set", () => {
    expect(oidcConfigFromEnv({})).toBeNull();
    expect(oidcConfigFromEnv({ ...env, OIDC_CLIENT_SECRET: " " })).toBeNull();
    expect(oidcConfigFromEnv({ ...env, OIDC_ISSUER: undefined })).toBeNull();
  });

  it("builds the discovery URL from the issuer, with or without the well-known path", () => {
    const expected = "https://auth.example.com/application/o/cal/.well-known/openid-configuration";
    expect(oidcConfigFromEnv(env)?.discoveryUrl).toBe(expected);
    expect(oidcConfigFromEnv({ ...env, OIDC_ISSUER: expected })?.discoveryUrl).toBe(expected);
    expect(oidcConfigFromEnv({ ...env, OIDC_ISSUER: "https://idp.example.com" })?.discoveryUrl).toBe(
      "https://idp.example.com/.well-known/openid-configuration"
    );
  });

  it("names the button after OIDC_NAME, or SSO", () => {
    expect(oidcConfigFromEnv(env)).toMatchObject({ clientId: "cal", clientSecret: "secret", name: "SSO" });
    expect(oidcConfigFromEnv({ ...env, OIDC_NAME: "Authentik" })?.name).toBe("Authentik");
  });
});
