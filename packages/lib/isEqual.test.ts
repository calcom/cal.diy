import { describe, expect, it } from "vitest";
import { isEqual } from "./isEqual";

describe("isEqual", () => {
  describe("primitives", () => {
    it("should return true for identical primitive values", () => {
      expect(isEqual(1, 1)).toBe(true);
      expect(isEqual("cal", "cal")).toBe(true);
      expect(isEqual(true, true)).toBe(true);
      expect(isEqual(false, false)).toBe(true);
    });

    it("should return false for different primitive values", () => {
      expect(isEqual(1, 2)).toBe(false);
      expect(isEqual("cal", "com")).toBe(false);
      expect(isEqual(true, false)).toBe(false);
    });

    it("should return false for different primitive types", () => {
      expect(isEqual(1, "1")).toBe(false);
      expect(isEqual(0, false)).toBe(false);
      expect(isEqual("", false)).toBe(false);
    });

    it("should correctly handle Symbol comparisons", () => {
      const sym = Symbol("test");
      expect(isEqual(sym, sym)).toBe(true);
      expect(isEqual(Symbol("test"), Symbol("test"))).toBe(false);
    });
  });

  describe("NaN and nullish values", () => {
    it("should return true when comparing NaN with NaN", () => {
      expect(isEqual(NaN, NaN)).toBe(true);
    });

    it("should return false when comparing NaN with normal numbers", () => {
      expect(isEqual(NaN, 0)).toBe(false);
      expect(isEqual(NaN, 1)).toBe(false);
    });

    it("should correctly compare null and undefined", () => {
      expect(isEqual(null, null)).toBe(true);
      expect(isEqual(undefined, undefined)).toBe(true);
      expect(isEqual(null, undefined)).toBe(false);
      expect(isEqual(null, {})).toBe(false);
      expect(isEqual(undefined, {})).toBe(false);
      expect(isEqual(null, 0)).toBe(false);
      expect(isEqual(undefined, "")).toBe(false);
    });
  });

  describe("Date instances", () => {
    it("should return true for identical dates", () => {
      const d1 = new Date("2024-01-01T12:00:00.000Z");
      const d2 = new Date("2024-01-01T12:00:00.000Z");
      expect(isEqual(d1, d2)).toBe(true);
    });

    it("should return false for different dates", () => {
      const d1 = new Date("2020-01-01T00:00:00.000Z");
      const d2 = new Date("2026-12-31T23:59:59.999Z");
      expect(isEqual(d1, d2)).toBe(false);
    });

    it("should handle invalid Date objects", () => {
      const inv1 = new Date("invalid");
      const inv2 = new Date("invalid");
      const valid = new Date("2024-01-01");
      expect(isEqual(inv1, inv2)).toBe(true);
      expect(isEqual(inv1, valid)).toBe(false);
    });

    it("should return false when comparing Date to non-Date", () => {
      const date = new Date("2024-01-01T00:00:00.000Z");
      expect(isEqual(date, "2024-01-01T00:00:00.000Z")).toBe(false);
      expect(isEqual(date, {})).toBe(false);
      expect(isEqual(date, date.getTime())).toBe(false);
    });
  });

  describe("RegExp instances", () => {
    it("should return true for identical regular expressions", () => {
      expect(isEqual(/^[a-z]+$/i, /^[a-z]+$/i)).toBe(true);
      expect(isEqual(/abc/g, /abc/g)).toBe(true);
    });

    it("should return false for different patterns or flags", () => {
      expect(isEqual(/abc/, /xyz/)).toBe(false);
      expect(isEqual(/abc/i, /abc/g)).toBe(false);
      expect(isEqual(/abc/, /abc/i)).toBe(false);
    });

    it("should return false when comparing RegExp to non-RegExp", () => {
      expect(isEqual(/abc/, "/abc/")).toBe(false);
      expect(isEqual(/abc/, {})).toBe(false);
    });
  });

  describe("Arrays", () => {
    it("should return true for identical arrays", () => {
      expect(isEqual([], [])).toBe(true);
      expect(isEqual([1, 2, 3], [1, 2, 3])).toBe(true);
      expect(isEqual(["a", "b"], ["a", "b"])).toBe(true);
    });

    it("should return false for arrays of different length or elements", () => {
      expect(isEqual([1, 2], [1, 2, 3])).toBe(false);
      expect(isEqual([1, 2], [1, 3])).toBe(false);
      expect(isEqual([1, 2], [2, 1])).toBe(false);
    });

    it("should return false when comparing an array to a plain object", () => {
      expect(isEqual([], {})).toBe(false);
      expect(isEqual([1], { 0: 1 })).toBe(false);
      expect(isEqual({ 0: 1 }, [1])).toBe(false);
    });

    it("should support deeply nested arrays", () => {
      expect(isEqual([1, [2, [3, 4]]], [1, [2, [3, 4]]])).toBe(true);
      expect(isEqual([1, [2, [3, 4]]], [1, [2, [3, 5]]])).toBe(false);
    });
  });

  describe("Objects", () => {
    it("should return true for identical shallow objects", () => {
      expect(isEqual({}, {})).toBe(true);
      expect(isEqual({ a: 1, b: "two" }, { a: 1, b: "two" })).toBe(true);
    });

    it("should be independent of property insertion order", () => {
      expect(isEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    });

    it("should return false for objects with different keys or values", () => {
      expect(isEqual({ a: 1 }, { a: 2 })).toBe(false);
      expect(isEqual({ a: 1 }, { b: 1 })).toBe(false);
      expect(isEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    });

    it("should return false when one object has an explicit undefined property and the other does not", () => {
      expect(isEqual({ a: undefined }, {})).toBe(false);
      expect(isEqual({}, { a: undefined })).toBe(false);
    });

    it("should deeply compare nested objects and arrays", () => {
      const obj1 = {
        id: "usr_123",
        profile: {
          name: "Alice",
          roles: ["admin", "member"],
          settings: {
            theme: "dark",
            notifications: { email: true, sms: false },
          },
        },
      };

      const obj2 = {
        id: "usr_123",
        profile: {
          name: "Alice",
          roles: ["admin", "member"],
          settings: {
            theme: "dark",
            notifications: { email: true, sms: false },
          },
        },
      };

      const obj3 = {
        ...obj2,
        profile: {
          ...obj2.profile,
          settings: {
            ...obj2.profile.settings,
            notifications: { email: true, sms: true },
          },
        },
      };

      expect(isEqual(obj1, obj2)).toBe(true);
      expect(isEqual(obj1, obj3)).toBe(false);
    });
  });

  describe("Functions", () => {
    it("should compare functions by reference", () => {
      const fn = (): void => {};
      expect(isEqual(fn, fn)).toBe(true);
      expect(
        isEqual(
          (): void => {},
          (): void => {}
        )
      ).toBe(false);
    });
  });

  describe("exotic built-ins", () => {
    it("returns true for the same Map reference", () => {
      const map = new Map([["a", 1]]);

      expect(isEqual(map, map)).toBe(true);
    });

    it("does not call two different Maps equal just because neither has own keys", () => {
      expect(isEqual(new Map([["a", 1]]), new Map())).toBe(false);
      expect(isEqual(new Map([["a", 1]]), new Map([["a", 1]]))).toBe(false);
    });

    it("does not call two different Sets equal just because neither has own keys", () => {
      expect(isEqual(new Set([1, 2]), new Set())).toBe(false);
      expect(isEqual(new Set([1, 2]), new Set([1, 2]))).toBe(false);
    });

    it("does not compare a Map against a plain object", () => {
      expect(isEqual(new Map(), {})).toBe(false);
      expect(isEqual({}, new Set())).toBe(false);
    });

    it("still compares class instances by their own enumerable keys", () => {
      class Point {
        constructor(
          public x: number,
          public y: number
        ) {}
      }

      expect(isEqual(new Point(1, 2), new Point(1, 2))).toBe(true);
      expect(isEqual(new Point(1, 2), new Point(1, 3))).toBe(false);
    });
  });

});
