import { describe, expect, it } from "vitest";
import { fromEntriesWithDuplicateKeys } from "./fromEntriesWithDuplicateKeys";

describe("fromEntriesWithDuplicateKeys", () => {
  describe("null, undefined, and empty iterables", () => {
    it("should return an empty object when passed null", () => {
      expect(fromEntriesWithDuplicateKeys(null)).toEqual({});
    });

    it("should return an empty object when passed undefined", () => {
      expect(fromEntriesWithDuplicateKeys(undefined)).toEqual({});
      expect(fromEntriesWithDuplicateKeys()).toEqual({});
    });

    it("should return an empty object when passed an empty array", () => {
      expect(fromEntriesWithDuplicateKeys([])).toEqual({});
    });
  });

  describe("unique keys", () => {
    it("should convert unique key-value pairs into an object with string values", () => {
      const entries: [string, string][] = [
        ["name", "Cal"],
        ["type", "booking"],
        ["status", "confirmed"],
      ];

      expect(fromEntriesWithDuplicateKeys(entries)).toEqual({
        name: "Cal",
        type: "booking",
        status: "confirmed",
      });
    });
  });

  describe("duplicate keys", () => {
    it("should convert pairs with duplicate keys into an array of strings", () => {
      const entries: [string, string][] = [
        ["guest", "alice@example.com"],
        ["guest", "bob@example.com"],
      ];

      expect(fromEntriesWithDuplicateKeys(entries)).toEqual({
        guest: ["alice@example.com", "bob@example.com"],
      });
    });

    it("should append multiple duplicate values into the same array in order", () => {
      const entries: [string, string][] = [
        ["tag", "open-source"],
        ["tag", "calendar"],
        ["tag", "scheduling"],
      ];

      expect(fromEntriesWithDuplicateKeys(entries)).toEqual({
        tag: ["open-source", "calendar", "scheduling"],
      });
    });

    it("should handle a mix of unique and duplicate keys", () => {
      const entries: [string, string][] = [
        ["event", "standup"],
        ["attendee", "alice"],
        ["attendee", "bob"],
        ["location", "meet"],
      ];

      expect(fromEntriesWithDuplicateKeys(entries)).toEqual({
        event: "standup",
        attendee: ["alice", "bob"],
        location: "meet",
      });
    });
  });

  describe("different iterable sources", () => {
    it("should support URLSearchParams entries", () => {
      const params = new URLSearchParams("filter=active&sort=desc&filter=pending");
      expect(fromEntriesWithDuplicateKeys(params.entries())).toEqual({
        filter: ["active", "pending"],
        sort: "desc",
      });
    });

    it("should support Map entries", () => {
      const map = new Map<string, string>([
        ["lang", "pt-BR"],
        ["theme", "dark"],
      ]);
      expect(fromEntriesWithDuplicateKeys(map.entries())).toEqual({
        lang: "pt-BR",
        theme: "dark",
      });
    });
  });

  describe("edge cases and security", () => {
    it("should safely handle property collisions such as 'hasOwnProperty'", () => {
      const entries: [string, string][] = [
        ["hasOwnProperty", "val1"],
        ["hasOwnProperty", "val2"],
        ["nextKey", "normal"],
      ];

      expect(() => fromEntriesWithDuplicateKeys(entries)).not.toThrow();
      expect(fromEntriesWithDuplicateKeys(entries)).toEqual({
        hasOwnProperty: ["val1", "val2"],
        nextKey: "normal",
      });
    });

    it("should skip __proto__ without polluting Object.prototype", () => {
      const entries: [string, string][] = [
        ["__proto__", "malicious"],
        ["__proto__", "malicious2"],
        ["safeKey", "safeValue"],
      ];

      const result = fromEntriesWithDuplicateKeys(entries);

      expect(result).toEqual({ safeKey: "safeValue" });
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
      expect(({} as Record<string, unknown>).malicious).toBeUndefined();
    });

    it("should keep a key named constructor as ordinary data", () => {
      const entries: [string, string][] = [
        ["constructor", "acme"],
        ["constructor", "acme2"],
      ];

      const result = fromEntriesWithDuplicateKeys(entries);

      expect(result.constructor).toEqual(["acme", "acme2"]);
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    });
  });
});
