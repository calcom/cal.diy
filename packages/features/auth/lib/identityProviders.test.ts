import { IdentityProvider } from "@calcom/prisma/enums";
import { describe, expect, it } from "vitest";
import { getIdentityProvider, NEXTAUTH_TO_IDENTITY_PROVIDER } from "./identityProviders";

describe("identityProviders", () => {
  describe("NEXTAUTH_TO_IDENTITY_PROVIDER", () => {
    it("contains exactly the expected mapping keys", () => {
      expect(Object.keys(NEXTAUTH_TO_IDENTITY_PROVIDER).sort()).toEqual(
        ["azure-ad", "cal", "google", "oidc", "saml", "saml-idp"].sort()
      );
    });
  });

  describe("getIdentityProvider", () => {
    it("maps 'azure-ad' to AZUREAD", () => {
      expect(getIdentityProvider("azure-ad")).toBe(IdentityProvider.AZUREAD);
    });

    it("maps 'google' to GOOGLE", () => {
      expect(getIdentityProvider("google")).toBe(IdentityProvider.GOOGLE);
    });

    it("maps 'saml' to SAML", () => {
      expect(getIdentityProvider("saml")).toBe(IdentityProvider.SAML);
    });

    it("maps 'saml-idp' to SAML", () => {
      expect(getIdentityProvider("saml-idp")).toBe(IdentityProvider.SAML);
    });

    it("maps 'cal' to CAL", () => {
      expect(getIdentityProvider("cal")).toBe(IdentityProvider.CAL);
    });

    it("maps 'oidc' to OIDC", () => {
      expect(getIdentityProvider("oidc")).toBe(IdentityProvider.OIDC);
    });

    it("returns null for unknown provider", () => {
      expect(getIdentityProvider("unknown-provider")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(getIdentityProvider("")).toBeNull();
    });
  });
});
