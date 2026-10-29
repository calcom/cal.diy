import { describe, expect, it } from "vitest";

import { parseOAuthScopes } from "../authorize-view";

describe("parseOAuthScopes", () => {
  it("should parse space-separated scopes according to RFC 6749", () => {
    const input = "READ_BOOKING READ_PROFILE";
    expect(parseOAuthScopes(input)).toEqual(["READ_BOOKING", "READ_PROFILE"]);
  });

  it("should parse comma-separated scopes for backwards compatibility", () => {
    const input = "READ_BOOKING,READ_PROFILE";
    expect(parseOAuthScopes(input)).toEqual(["READ_BOOKING", "READ_PROFILE"]);
  });

  it("should parse mixed comma-and-space delimited scopes", () => {
    const input = "READ_BOOKING, READ_PROFILE";
    expect(parseOAuthScopes(input)).toEqual(["READ_BOOKING", "READ_PROFILE"]);
  });

  it("should handle multiple consecutive whitespace and comma characters cleanly", () => {
    const input = "  READ_BOOKING   ,   READ_PROFILE  ";
    expect(parseOAuthScopes(input)).toEqual(["READ_BOOKING", "READ_PROFILE"]);
  });

  it("should return a single scope when only one is provided", () => {
    const input = "READ_BOOKING";
    expect(parseOAuthScopes(input)).toEqual(["READ_BOOKING"]);
  });

  it("should return an empty array for undefined, null, or empty string", () => {
    expect(parseOAuthScopes(undefined)).toEqual([]);
    expect(parseOAuthScopes(null)).toEqual([]);
    expect(parseOAuthScopes("")).toEqual([]);
    expect(parseOAuthScopes("   ")).toEqual([]);
  });

  it("should preserve unknown scope tokens for server-side validation", () => {
    const input = "READ_BOOKING UNKNOWN_CUSTOM_SCOPE";
    expect(parseOAuthScopes(input)).toEqual(["READ_BOOKING", "UNKNOWN_CUSTOM_SCOPE"]);
  });
});
