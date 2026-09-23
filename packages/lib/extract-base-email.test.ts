import { describe, expect, it } from "vitest";

import { extractBaseEmail } from "./extract-base-email";

describe("extractBaseEmail", () => {
  it("should extract base email removing plus aliases", () => {
    expect(extractBaseEmail("user+alias@example.com")).toBe("user@example.com");
  });

  it("should return email unchanged if no plus alias", () => {
    expect(extractBaseEmail("user@example.com")).toBe("user@example.com");
  });

  it("should return input unchanged if no @ sign", () => {
    expect(extractBaseEmail("notanemail")).toBe("notanemail");
  });

  it("should handle empty string", () => {
    expect(extractBaseEmail("")).toBe("");
  });
});
