import { describe, expect, it } from "vitest";
import { resolvePrefillEmission, sanitizePhonePrefillValue } from "./sanitize-phone-prefill";

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

describe("resolvePrefillEmission", () => {
  it("re-emits when a previously-seen dirty value returns after normalization", () => {
    let guard: string | undefined = undefined;

    // formatted value arrives -> emit normalized form
    let emission = resolvePrefillEmission("+1 (415) 555-1234", guard);
    expect(emission.sanitized).toBe("+14155551234");
    guard = emission.nextGuard;

    // parent applies the normalized value -> nothing to emit, guard resets
    emission = resolvePrefillEmission("+14155551234", guard);
    expect(emission.sanitized).toBeNull();
    expect(emission.nextGuard).toBeUndefined();
    guard = emission.nextGuard;

    // same formatted value arrives again -> emit again, not suppressed
    emission = resolvePrefillEmission("+1 (415) 555-1234", guard);
    expect(emission.sanitized).toBe("+14155551234");
  });

  it("suppresses repeat emissions for an unchanged dirty value", () => {
    const first = resolvePrefillEmission("+1 (415) 555-1234", undefined);
    expect(first.sanitized).toBe("+14155551234");

    const second = resolvePrefillEmission("+1 (415) 555-1234", first.nextGuard);
    expect(second.sanitized).toBeNull();
  });
});
