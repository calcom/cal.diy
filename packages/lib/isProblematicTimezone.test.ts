import { describe, expect, it } from "vitest";

import isProblematicTimezone from "./isProblematicTimezone";

describe("isProblematicTimezone", () => {
  it("should return true for known problematic timezones", () => {
    expect(isProblematicTimezone("America/Cayman")).toBe(true);
    expect(isProblematicTimezone("Europe/Vatican")).toBe(true);
    expect(isProblematicTimezone("Pacific/Saipan")).toBe(true);
  });

  it("should return false for valid standard timezones", () => {
    expect(isProblematicTimezone("America/New_York")).toBe(false);
    expect(isProblematicTimezone("Europe/London")).toBe(false);
    expect(isProblematicTimezone("Asia/Tokyo")).toBe(false);
  });

  it("should safely handle null, undefined, or empty string", () => {
    expect(isProblematicTimezone(null)).toBe(false);
    expect(isProblematicTimezone(undefined)).toBe(false);
    expect(isProblematicTimezone("")).toBe(false);
  });
});
