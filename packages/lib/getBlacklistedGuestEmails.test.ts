import process from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import { getBlacklistedGuestEmails, isGuestEmailBlacklisted } from "./getBlacklistedGuestEmails";

describe("getBlacklistedGuestEmails", () => {
  const originalEnv = process.env.BLACKLISTED_GUEST_EMAILS;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.BLACKLISTED_GUEST_EMAILS;
    } else {
      process.env.BLACKLISTED_GUEST_EMAILS = originalEnv;
    }
  });

  it("returns empty array when BLACKLISTED_GUEST_EMAILS is undefined", () => {
    delete process.env.BLACKLISTED_GUEST_EMAILS;
    expect(getBlacklistedGuestEmails()).toEqual([]);
  });

  it("returns empty array when BLACKLISTED_GUEST_EMAILS is empty string", () => {
    process.env.BLACKLISTED_GUEST_EMAILS = "";
    expect(getBlacklistedGuestEmails()).toEqual([]);
  });

  it("trims whitespace around comma-separated emails and converts to lowercase", () => {
    process.env.BLACKLISTED_GUEST_EMAILS = " spam@example.com, Other@Example.com ,BLOCK@Test.COM ";
    expect(getBlacklistedGuestEmails()).toEqual(["spam@example.com", "other@example.com", "block@test.com"]);
  });

  it("handles newlines, tabs, and filters out empty entries", () => {
    process.env.BLACKLISTED_GUEST_EMAILS = " \n\ta@example.com,\t,b@example.com,\n,, ";
    expect(getBlacklistedGuestEmails()).toEqual(["a@example.com", "b@example.com"]);
  });
});

describe("isGuestEmailBlacklisted", () => {
  const originalEnv = process.env.BLACKLISTED_GUEST_EMAILS;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.BLACKLISTED_GUEST_EMAILS;
    } else {
      process.env.BLACKLISTED_GUEST_EMAILS = originalEnv;
    }
  });

  it("returns false for empty email or undefined env", () => {
    delete process.env.BLACKLISTED_GUEST_EMAILS;
    expect(isGuestEmailBlacklisted("")).toBe(false);
    expect(isGuestEmailBlacklisted("test@example.com")).toBe(false);
  });

  it("detects blacklisted email even with whitespace or mixed case", () => {
    process.env.BLACKLISTED_GUEST_EMAILS = "spam@example.com, other@example.com";
    expect(isGuestEmailBlacklisted("other@example.com")).toBe(true);
    expect(isGuestEmailBlacklisted("  OTHER@example.com ")).toBe(true);
    expect(isGuestEmailBlacklisted("allowed@example.com")).toBe(false);
  });
});
