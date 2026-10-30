import { describe, expect, it } from "vitest";

import { formatPhoneNumber } from "./formatPhoneNumber";

describe("formatPhoneNumber", () => {
  it("should format valid phone number with country code", () => {
    const result = formatPhoneNumber("+12025550123");
    expect(result).toBe("+1 202 555 0123");
  });

  it("should format valid international phone number", () => {
    const result = formatPhoneNumber("+442071838750");
    expect(result).toBe("+44 20 7183 8750");
  });

  it("should safely return original string on invalid phone number", () => {
    const invalidNumber = "invalid-phone-number";
    const result = formatPhoneNumber(invalidNumber);
    expect(result).toBe(invalidNumber);
  });

  it("should safely return empty string when passed empty string", () => {
    const result = formatPhoneNumber("");
    expect(result).toBe("");
  });
});
