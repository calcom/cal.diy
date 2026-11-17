import { describe, expect, it } from "vitest";
import { hashEmail, Md5PiiHasher } from "./PiiHasher";

describe("PII Hasher Test Suite", () => {
  const hasher = new Md5PiiHasher("test-salt");

  it("can hash email addresses deterministically and preserve domain", async () => {
    const email = "sensitive_data@example.com";
    const hashedEmail = hashEmail(email, hasher);
    // Domain must be preserved
    expect(hashedEmail.endsWith("@example.com")).toBe(true);
    // Local part should change
    expect(hashedEmail.split("@")[0]).not.toBe("sensitive_data");
    // Deterministic
    expect(hashEmail(email, hasher)).toBe(hashedEmail);
  });

  it("can hash PII deterministically to a 128-bit hex string", async () => {
    const pii = "sensitive_data";
    const hashedPii = hasher.hash(pii);
    // 128-bit hex (32 hex chars)
    expect(hashedPii).toMatch(/^[0-9a-f]{32}$/);
    // Deterministic
    expect(hasher.hash(pii)).toBe(hashedPii);
  });

  it("handles hashing with different salt", () => {
    const differentHasher = new Md5PiiHasher("different-salt");
    const pii = "sensitive_data";
    const hashedPii = differentHasher.hash(pii);
    expect(hashedPii).not.toBe(hasher.hash(pii));
  });
});
