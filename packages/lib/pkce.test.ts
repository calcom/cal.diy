import { describe, expect, it } from "vitest";
import { isValidCodeChallengeMethod, verifyCodeChallenge } from "./pkce";

describe("PKCE Functions", () => {
  describe("verifyCodeChallenge", () => {
    it("should verify S256 code challenge correctly", () => {
      const codeVerifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
      const codeChallenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

      const result = verifyCodeChallenge(codeVerifier, codeChallenge, "S256");
      expect(result).toBe(true);
    });

    it("should fail verification with wrong S256 code challenge", () => {
      const codeVerifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
      const wrongCodeChallenge = "wrong_challenge_value";

      const result = verifyCodeChallenge(codeVerifier, wrongCodeChallenge, "S256");
      expect(result).toBe(false);
    });

    it("should default to S256 method when none specified", () => {
      const codeVerifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
      const codeChallenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

      const result = verifyCodeChallenge(codeVerifier, codeChallenge);
      expect(result).toBe(true);
    });

    it("should return false for unsupported method", () => {
      const codeVerifier = "test_verifier";
      const codeChallenge = "test_challenge";

      const result = verifyCodeChallenge(codeVerifier, codeChallenge, "MD5");
      expect(result).toBe(false);
    });
  });

  describe("isValidCodeChallengeMethod", () => {
    it("should accept S256 method", () => {
      expect(isValidCodeChallengeMethod("S256")).toBe(true);
    });

    it("should reject unsupported methods", () => {
      expect(isValidCodeChallengeMethod("plain")).toBe(false);
      expect(isValidCodeChallengeMethod("MD5")).toBe(false);
      expect(isValidCodeChallengeMethod("SHA1")).toBe(false);
      expect(isValidCodeChallengeMethod("invalid")).toBe(false);
      expect(isValidCodeChallengeMethod("")).toBe(false);
    });
  });
});
