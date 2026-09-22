import { describe, expect, it } from "vitest";

import { extractBaseEmail } from "./extract-base-email";

describe("extractBaseEmail", () => {
  describe("plus addressing", () => {
    it.each([
      ["a single tag", "user+tag@example.com", "user@example.com"],
      ["several tags", "user+one+two@example.com", "user@example.com"],
      ["an empty tag", "user+@example.com", "user@example.com"],
      ["a leading plus", "+tag@example.com", "@example.com"],
      ["no tag at all", "user@example.com", "user@example.com"],
    ])("strips %s", (_label, input, expected) => {
      expect(extractBaseEmail(input)).toBe(expected);
    });

    it("leaves a plus in the domain alone", () => {
      expect(extractBaseEmail("user@ex+ample.com")).toBe("user@ex+ample.com");
    });

    it("preserves case, which callers lowercase themselves", () => {
      expect(extractBaseEmail("User+Tag@Example.com")).toBe("User@Example.com");
    });

    it("keeps dots and dashes in the local part", () => {
      expect(extractBaseEmail("first.last-name+tag@example.co.uk")).toBe(
        "first.last-name@example.co.uk"
      );
    });
  });

  describe("matching, which is what the call sites use this for", () => {
    it("collapses a tagged address onto its base", () => {
      expect(extractBaseEmail("user+booking@example.com")).toBe(extractBaseEmail("user@example.com"));
    });

    it("keeps different users apart", () => {
      expect(extractBaseEmail("alice+tag@example.com")).not.toBe(
        extractBaseEmail("bob+tag@example.com")
      );
    });

    it("keeps the same local part on different domains apart", () => {
      expect(extractBaseEmail("user@example.com")).not.toBe(extractBaseEmail("user@other.com"));
    });

    it("does not collapse two different malformed entries onto one value", () => {
      // The previous implementation returned "@undefined" for "" and "x@undefined" for any string
      // without an "@", so unrelated malformed guest entries compared equal and removing one could
      // remove the other.
      const malformed = ["", "   ", "notanemail", "alsonotanemail"].map(extractBaseEmail);

      expect(new Set(malformed).size).toBe(malformed.length);
      expect(malformed).not.toContain("@undefined");
    });
  });

  describe("input that is not a usable address", () => {
    it.each([
      ["a string with no @", "notanemail", "notanemail"],
      ["an empty string", "", ""],
      ["whitespace only", "   ", "   "],
    ])("returns %s unchanged", (_label, input, expected) => {
      expect(extractBaseEmail(input)).toBe(expected);
    });

    it.each([
      ["null", null],
      ["undefined", undefined],
      ["a number", 42],
      ["an object", {}],
    ])("returns an empty string for %s from untyped code", (_label, input) => {
      expect(() => extractBaseEmail(input as unknown as string)).not.toThrow();
      expect(extractBaseEmail(input as unknown as string)).toBe("");
    });

    it("never appends the string 'undefined' to a domain", () => {
      for (const input of ["notanemail", "", "user"]) {
        expect(extractBaseEmail(input)).not.toMatch(/@undefined$/);
      }
    });
  });

  describe("more than one @", () => {
    it("keeps the whole domain rather than truncating at the second @", () => {
      expect(extractBaseEmail("user+tag@sub@example.com")).toBe("user@sub@example.com");
    });
  });
});
