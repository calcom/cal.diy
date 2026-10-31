import { describe, expect, it } from "vitest";

import { contructEmailFromPhoneNumber } from "./contructEmailFromPhoneNumber";

describe("contructEmailFromPhoneNumber", () => {
  describe("digits are kept, everything else is dropped", () => {
    it.each([
      ["an E.164 number", "+5511999998888", "5511999998888@sms.cal.com"],
      ["no plus sign", "5511999998888", "5511999998888@sms.cal.com"],
      ["spaces and a dash", "+55 11 99999-8888", "5511999998888@sms.cal.com"],
      ["parentheses and a dot", "+55(11)99999.8888", "5511999998888@sms.cal.com"],
      ["leading and trailing spaces", "  +5511999998888  ", "5511999998888@sms.cal.com"],
      ["a unicode dash", "+55‑11‑99999‑8888", "5511999998888@sms.cal.com"],
    ])("handles %s", (_label, input, expected) => {
      expect(contructEmailFromPhoneNumber(input)).toBe(expected);
    });

    it("produces the same address for every formatting of one number", () => {
      const addresses = [
        "+5511999998888",
        "+55 11 99999-8888",
        "+55(11)99999.8888",
        "55 11 999998888",
      ].map(contructEmailFromPhoneNumber);

      expect(new Set(addresses).size).toBe(1);
    });

    it("always produces an address without whitespace", () => {
      // isValidPhoneNumber accepts "+55 11 99999-8888", so a formatted number does reach here and
      // must not end up as an address containing spaces.
      expect(contructEmailFromPhoneNumber("+55 11 99999-8888")).not.toMatch(/\s/);
    });
  });

  describe("input with no digits", () => {
    it.each([
      ["an empty string", ""],
      ["only whitespace", "   "],
      ["only punctuation", "+()-."],
      ["letters", "not a phone"],
    ])("returns an empty string for %s", (_label, input) => {
      expect(contructEmailFromPhoneNumber(input)).toBe("");
    });

    it.each([
      ["null", null],
      ["undefined", undefined],
      ["a number", 5511999998888],
      ["an object", {}],
    ])("returns an empty string for %s from untyped code", (_label, input) => {
      expect(() => contructEmailFromPhoneNumber(input as unknown as string)).not.toThrow();
      expect(contructEmailFromPhoneNumber(input as unknown as string)).toBe("");
    });

    it("never hands two unusable inputs the same address", () => {
      // "@sms.cal.com" would validate as an address and merge unrelated attendees onto one identity.
      expect(contructEmailFromPhoneNumber("")).not.toBe("@sms.cal.com");
      expect(contructEmailFromPhoneNumber("no digits")).not.toBe("@sms.cal.com");
    });
  });

  describe("distinct numbers stay distinct", () => {
    it("maps different numbers to different addresses", () => {
      expect(contructEmailFromPhoneNumber("+5511999998888")).not.toBe(
        contructEmailFromPhoneNumber("+5511999998889")
      );
    });

    it("keeps the country code, so two national numbers do not collide", () => {
      expect(contructEmailFromPhoneNumber("+5511999998888")).not.toBe(
        contructEmailFromPhoneNumber("+115511999998888")
      );
    });
  });
});
