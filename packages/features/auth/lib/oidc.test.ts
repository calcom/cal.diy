import process from "node:process";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("oidc", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const key of [
      "OIDC_CLIENT_ID",
      "OIDC_CLIENT_SECRET",
      "OIDC_ISSUER",
      "OIDC_PROVIDER_NAME",
      "OIDC_LOGIN_ENABLED",
    ]) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
    vi.resetModules();
  });

  it("reads OIDC_CLIENT_ID from env", async () => {
    process.env.OIDC_CLIENT_ID = "test-client-id";
    const { OIDC_CLIENT_ID } = await import("./oidc");
    expect(OIDC_CLIENT_ID).toBe("test-client-id");
  });

  it("reads OIDC_CLIENT_SECRET from env", async () => {
    process.env.OIDC_CLIENT_SECRET = "test-secret";
    const { OIDC_CLIENT_SECRET } = await import("./oidc");
    expect(OIDC_CLIENT_SECRET).toBe("test-secret");
  });

  it("reads OIDC_ISSUER from env", async () => {
    process.env.OIDC_ISSUER = "https://auth.example.com";
    const { OIDC_ISSUER } = await import("./oidc");
    expect(OIDC_ISSUER).toBe("https://auth.example.com");
  });

  it("OIDC_PROVIDER_NAME falls back to 'OIDC' when unset", async () => {
    delete process.env.OIDC_PROVIDER_NAME;
    const { OIDC_PROVIDER_NAME } = await import("./oidc");
    expect(OIDC_PROVIDER_NAME).toBe("OIDC");
  });

  it("OIDC_PROVIDER_NAME uses the configured display name when set", async () => {
    process.env.OIDC_PROVIDER_NAME = "Authentik";
    const { OIDC_PROVIDER_NAME } = await import("./oidc");
    expect(OIDC_PROVIDER_NAME).toBe("Authentik");
  });

  it("OIDC_LOGIN_ENABLED is true only for exact string 'true'", async () => {
    process.env.OIDC_LOGIN_ENABLED = "true";
    const mod = await import("./oidc");
    expect(mod.OIDC_LOGIN_ENABLED).toBe(true);
  });

  it("OIDC_LOGIN_ENABLED is false for other values", async () => {
    process.env.OIDC_LOGIN_ENABLED = "1";
    const mod = await import("./oidc");
    expect(mod.OIDC_LOGIN_ENABLED).toBe(false);
  });

  it("IS_OIDC_LOGIN_ENABLED is true when all required vars are set", async () => {
    process.env.OIDC_CLIENT_ID = "client-id";
    process.env.OIDC_CLIENT_SECRET = "client-secret";
    process.env.OIDC_ISSUER = "https://auth.example.com";
    process.env.OIDC_LOGIN_ENABLED = "true";
    const { IS_OIDC_LOGIN_ENABLED } = await import("./oidc");
    expect(IS_OIDC_LOGIN_ENABLED).toBe(true);
  });

  it("IS_OIDC_LOGIN_ENABLED is false when client ID is missing", async () => {
    delete process.env.OIDC_CLIENT_ID;
    process.env.OIDC_CLIENT_SECRET = "client-secret";
    process.env.OIDC_ISSUER = "https://auth.example.com";
    process.env.OIDC_LOGIN_ENABLED = "true";
    const { IS_OIDC_LOGIN_ENABLED } = await import("./oidc");
    expect(IS_OIDC_LOGIN_ENABLED).toBe(false);
  });

  it("IS_OIDC_LOGIN_ENABLED is false when client secret is missing", async () => {
    process.env.OIDC_CLIENT_ID = "client-id";
    delete process.env.OIDC_CLIENT_SECRET;
    process.env.OIDC_ISSUER = "https://auth.example.com";
    process.env.OIDC_LOGIN_ENABLED = "true";
    const { IS_OIDC_LOGIN_ENABLED } = await import("./oidc");
    expect(IS_OIDC_LOGIN_ENABLED).toBe(false);
  });

  it("IS_OIDC_LOGIN_ENABLED is false when issuer is missing", async () => {
    process.env.OIDC_CLIENT_ID = "client-id";
    process.env.OIDC_CLIENT_SECRET = "client-secret";
    delete process.env.OIDC_ISSUER;
    process.env.OIDC_LOGIN_ENABLED = "true";
    const { IS_OIDC_LOGIN_ENABLED } = await import("./oidc");
    expect(IS_OIDC_LOGIN_ENABLED).toBe(false);
  });

  it("IS_OIDC_LOGIN_ENABLED is false when OIDC_LOGIN_ENABLED is not 'true'", async () => {
    process.env.OIDC_CLIENT_ID = "client-id";
    process.env.OIDC_CLIENT_SECRET = "client-secret";
    process.env.OIDC_ISSUER = "https://auth.example.com";
    delete process.env.OIDC_LOGIN_ENABLED;
    const { IS_OIDC_LOGIN_ENABLED } = await import("./oidc");
    expect(IS_OIDC_LOGIN_ENABLED).toBe(false);
  });
});
