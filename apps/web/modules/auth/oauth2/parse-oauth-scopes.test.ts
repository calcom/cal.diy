import { describe, expect, it } from "vitest";

import { parseOAuthScopes } from "./parse-oauth-scopes";

describe("parseOAuthScopes", () => {
  it("returns empty array for empty, undefined or null scope", () => {
    expect(parseOAuthScopes()).toEqual([]);
    expect(parseOAuthScopes(null)).toEqual([]);
    expect(parseOAuthScopes("")).toEqual([]);
    expect(parseOAuthScopes("   ")).toEqual([]);
  });

  it("handles standard space-separated scopes (RFC 6749)", () => {
    expect(parseOAuthScopes("READ_BOOKING READ_PROFILE")).toEqual(["READ_BOOKING", "READ_PROFILE"]);
  });

  it("handles legacy comma-separated scopes", () => {
    expect(parseOAuthScopes("READ_BOOKING,READ_PROFILE")).toEqual(["READ_BOOKING", "READ_PROFILE"]);
  });

  it("handles mixed comma and space delimiters with irregular whitespace", () => {
    expect(parseOAuthScopes("READ_BOOKING, READ_PROFILE  WRITE_BOOKING")).toEqual([
      "READ_BOOKING",
      "READ_PROFILE",
      "WRITE_BOOKING",
    ]);
  });

  it("preserves unknown scope tokens for server-side validation", () => {
    expect(parseOAuthScopes("READ_BOOKING UNKNOWN_SCOPE")).toEqual(["READ_BOOKING", "UNKNOWN_SCOPE"]);
  });
});
