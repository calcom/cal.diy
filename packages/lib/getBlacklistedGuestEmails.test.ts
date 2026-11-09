import process from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import { getBlacklistedGuestEmails, parseBlacklistedGuestEmails } from "./getBlacklistedGuestEmails";

describe("parseBlacklistedGuestEmails", () => {
  it("returns an empty list for undefined, null and empty values", () => {
    expect(parseBlacklistedGuestEmails(undefined)).toEqual([]);
    expect(parseBlacklistedGuestEmails(null)).toEqual([]);
    expect(parseBlacklistedGuestEmails("")).toEqual([]);
  });

  it("splits a plain comma-separated list", () => {
    expect(parseBlacklistedGuestEmails("a@example.com,b@example.com")).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
  });

  it("trims whitespace around separators", () => {
    expect(parseBlacklistedGuestEmails("a@example.com, b@example.com ,  c@example.com")).toEqual([
      "a@example.com",
      "b@example.com",
      "c@example.com",
    ]);
  });

  it("trims leading/trailing whitespace and line breaks", () => {
    expect(parseBlacklistedGuestEmails(" a@example.com,\nb@example.com\n")).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
  });

  it("lowercases entries so comparisons can be exact", () => {
    expect(parseBlacklistedGuestEmails("Spam@Example.COM")).toEqual(["spam@example.com"]);
  });

  it("drops empty entries from trailing or doubled commas", () => {
    expect(parseBlacklistedGuestEmails("a@example.com,,b@example.com,")).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
  });
});

describe("getBlacklistedGuestEmails", () => {
  const original = process.env.BLACKLISTED_GUEST_EMAILS;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.BLACKLISTED_GUEST_EMAILS;
    } else {
      process.env.BLACKLISTED_GUEST_EMAILS = original;
    }
  });

  it("reads and normalizes the env var", () => {
    process.env.BLACKLISTED_GUEST_EMAILS = "A@example.com, b@example.com";
    expect(getBlacklistedGuestEmails()).toEqual(["a@example.com", "b@example.com"]);
  });

  it("returns an empty list when the env var is unset", () => {
    delete process.env.BLACKLISTED_GUEST_EMAILS;
    expect(getBlacklistedGuestEmails()).toEqual([]);
  });
});
