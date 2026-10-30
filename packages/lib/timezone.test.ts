import { describe, expect, it } from "vitest";
import { canonicalizeTimezone } from "./timezone";

describe("canonicalizeTimezone", () => {
  it("maps pre-rename IANA link ids to their canonical ids", () => {
    expect(canonicalizeTimezone("Europe/Kiev")).toBe("Europe/Kyiv");
    expect(canonicalizeTimezone("Asia/Rangoon")).toBe("Asia/Yangon");
    expect(canonicalizeTimezone("Asia/Saigon")).toBe("Asia/Ho_Chi_Minh");
  });

  it("is idempotent for already canonical ids", () => {
    expect(canonicalizeTimezone("Europe/Kyiv")).toBe("Europe/Kyiv");
    expect(canonicalizeTimezone("Asia/Yangon")).toBe("Asia/Yangon");
  });

  it("passes through unknown and non-renamed ids unchanged", () => {
    expect(canonicalizeTimezone("America/Toronto")).toBe("America/Toronto");
    expect(canonicalizeTimezone("Europe/London")).toBe("Europe/London");
    expect(canonicalizeTimezone("Not/AZone")).toBe("Not/AZone");
  });

  it("does not resolve inherited Object.prototype keys", () => {
    // A bare index would hand back Object.prototype / Object here, which is not
    // a string and breaks callers that treat the result as one.
    for (const key of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
      expect(canonicalizeTimezone(key)).toBe(key);
    }
  });
});
