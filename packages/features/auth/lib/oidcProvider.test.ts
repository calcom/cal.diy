import { describe, expect, it } from "vitest";
import { createOidcProvider } from "./oidcProvider";

describe("createOidcProvider", () => {
  const baseOptions = {
    clientId: "client-id",
    clientSecret: "client-secret",
    issuer: "https://auth.example.com",
    providerName: "Authentik",
  };

  it("uses a fixed 'oidc' provider id and 'oauth' type", () => {
    const provider = createOidcProvider(baseOptions);
    expect(provider.id).toBe("oidc");
    expect(provider.type).toBe("oauth");
  });

  it("uses the configured display name", () => {
    const provider = createOidcProvider(baseOptions);
    expect(provider.name).toBe("Authentik");
  });

  it("builds the wellKnown discovery URL from the issuer", () => {
    const provider = createOidcProvider(baseOptions);
    expect(provider.wellKnown).toBe("https://auth.example.com/.well-known/openid-configuration");
  });

  it("strips a trailing slash from the issuer before building the discovery URL", () => {
    const provider = createOidcProvider({ ...baseOptions, issuer: "https://auth.example.com/" });
    expect(provider.wellKnown).toBe("https://auth.example.com/.well-known/openid-configuration");
    expect(provider.issuer).toBe("https://auth.example.com");
  });

  it("strips multiple trailing slashes from the issuer", () => {
    const provider = createOidcProvider({ ...baseOptions, issuer: "https://auth.example.com//" });
    expect(provider.wellKnown).toBe("https://auth.example.com/.well-known/openid-configuration");
  });

  it("requires PKCE and state checks", () => {
    const provider = createOidcProvider(baseOptions);
    expect(provider.checks).toEqual(["pkce", "state"]);
  });

  it("passes through clientId and clientSecret", () => {
    const provider = createOidcProvider(baseOptions);
    expect(provider.clientId).toBe("client-id");
    expect(provider.clientSecret).toBe("client-secret");
  });

  describe("profile mapping", () => {
    it("maps sub, name, email, and picture", () => {
      const provider = createOidcProvider(baseOptions);
      const result = provider.profile?.(
        { sub: "1", name: "Jane Doe", email: "jane@example.com", picture: "https://example.com/jane.png" },
        {} as never
      );
      expect(result).toEqual({
        id: "1",
        name: "Jane Doe",
        email: "jane@example.com",
        image: "https://example.com/jane.png",
      });
    });

    it("falls back to preferred_username when name is absent", () => {
      const provider = createOidcProvider(baseOptions);
      const result = provider.profile?.(
        { sub: "1", preferred_username: "janedoe", email: "jane@example.com" },
        {} as never
      );
      expect(result?.name).toBe("janedoe");
    });

    it("falls back to email when name and preferred_username are absent", () => {
      const provider = createOidcProvider(baseOptions);
      const result = provider.profile?.({ sub: "1", email: "jane@example.com" }, {} as never);
      expect(result?.name).toBe("jane@example.com");
    });

    it("falls back to sub when no other name field is present", () => {
      const provider = createOidcProvider(baseOptions);
      const result = provider.profile?.({ sub: "user-1" }, {} as never);
      expect(result?.name).toBe("user-1");
    });

    it("maps a missing picture to a null image", () => {
      const provider = createOidcProvider(baseOptions);
      const result = provider.profile?.({ sub: "1", email: "jane@example.com" }, {} as never);
      expect(result?.image).toBeNull();
    });
  });
});
