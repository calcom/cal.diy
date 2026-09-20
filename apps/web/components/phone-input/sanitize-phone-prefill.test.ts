import { describe, expect, it } from "vitest";
import { sanitizePhonePrefillValue } from "./sanitize-phone-prefill";

describe("sanitizePhonePrefillValue", () => {
  it("leaves clean international numbers untouched", () => {
    expect(sanitizePhonePrefillValue("+14155551234")).toBeNull();
  });

  it("leaves calling-code-only values untouched", () => {
    expect(sanitizePhonePrefillValue("+371")).toBeNull();
  });

  it("strips formatting characters from prefilled international numbers", () => {
    expect(sanitizePhonePrefillValue("+1 (415) 555-1234")).toBe("+14155551234");
  });

  it("trims surrounding whitespace before comparing", () => {
    expect(sanitizePhonePrefillValue("  +14155551234  ")).toBe("+14155551234");
  });

  it("returns null for a lone plus sign", () => {
    expect(sanitizePhonePrefillValue("+")).toBeNull();
  });

  it("returns null for blank values", () => {
    expect(sanitizePhonePrefillValue("")).toBeNull();
    expect(sanitizePhonePrefillValue("   ")).toBeNull();
  });
});
