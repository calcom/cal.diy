import { describe, expect, it } from "vitest";
import { safeStringify } from "./safeStringify";

describe("safeStringify", () => {
  describe("primitives and basic data structures", () => {
    it("should stringify simple objects and arrays", () => {
      expect(safeStringify({ a: 1, b: "cal" })).toBe('{"a":1,"b":"cal"}');
      expect(safeStringify([1, 2, 3])).toBe("[1,2,3]");
      expect(safeStringify(null)).toBe("null");
      expect(safeStringify(true)).toBe("true");
      expect(safeStringify(42)).toBe("42");
      expect(safeStringify("hello")).toBe('"hello"');
    });
  });

  describe("circular references", () => {
    it("should replace direct circular references with [Circular] instead of crashing", () => {
      const obj: Record<string, unknown> = { id: "item-1" };
      obj.self = obj;

      const result = safeStringify(obj);
      expect(typeof result).toBe("string");
      expect(JSON.parse(result)).toEqual({
        id: "item-1",
        self: "[Circular]",
      });
    });

    it("should handle deep mutual circular references", () => {
      const parent: Record<string, unknown> = { name: "parent" };
      const child: Record<string, unknown> = { name: "child", parent };
      parent.child = child;

      const result = safeStringify(parent);
      expect(typeof result).toBe("string");
      expect(result).toContain("[Circular]");
      expect(result).toContain('"name":"parent"');
      expect(result).toContain('"name":"child"');
    });
  });

  describe("shared (non-circular) references", () => {
    it("serializes a value referenced twice as a sibling in full", () => {
      const shared = { id: 7, label: "shared" };

      const result = safeStringify({ left: shared, right: shared });

      expect(JSON.parse(result)).toEqual({
        left: { id: 7, label: "shared" },
        right: { id: 7, label: "shared" },
      });
      expect(result).not.toContain("[Circular]");
    });

    it("serializes a value repeated across array entries in full", () => {
      const shared = { id: 1 };

      const result = safeStringify([shared, shared, shared]);

      expect(JSON.parse(result)).toEqual([{ id: 1 }, { id: 1 }, { id: 1 }]);
      expect(result).not.toContain("[Circular]");
    });

    it("serializes a value reused at different depths in full", () => {
      const shared = { tag: "reused" };

      const result = safeStringify({ a: shared, b: { c: { d: shared } } });

      expect(JSON.parse(result)).toEqual({
        a: { tag: "reused" },
        b: { c: { d: { tag: "reused" } } },
      });
      expect(result).not.toContain("[Circular]");
    });

    it("still flags a cycle that reaches back through a shared node", () => {
      const shared: Record<string, unknown> = { tag: "shared" };
      const root: Record<string, unknown> = { first: shared, second: shared };
      shared.root = root;

      const parsed = JSON.parse(safeStringify(root));

      expect(parsed).toEqual({
        first: { tag: "shared", root: "[Circular]" },
        second: { tag: "shared", root: "[Circular]" },
      });
    });
  });

  describe("BigInt support", () => {
    it("should serialize BigInt values inside objects as strings without throwing", () => {
      const data = { id: "booking_1", timestamp: BigInt("1710000000000") };
      const result = safeStringify(data);
      expect(typeof result).toBe("string");
      expect(JSON.parse(result)).toEqual({
        id: "booking_1",
        timestamp: "1710000000000",
      });
    });

    it("should serialize a top-level BigInt", () => {
      const result = safeStringify(BigInt(100));
      expect(result).toBe('"100"');
    });
  });

  describe("Error objects", () => {
    it("should extract stack or message for top-level Error instances", () => {
      const err = new Error("Database connection failed");
      const result = safeStringify(err);
      expect(typeof result).toBe("string");
      expect(result).toContain("Database connection failed");
    });

    it("should serialize Error objects nested inside an object structure", () => {
      const payload = {
        context: "webhook_dispatch",
        error: new Error("HTTP 500 timeout"),
      };

      const result = safeStringify(payload);
      expect(typeof result).toBe("string");
      const parsed = JSON.parse(result);
      expect(parsed.context).toBe("webhook_dispatch");
      expect(parsed.error.message).toBe("HTTP 500 timeout");
      expect(parsed.error.name).toBe("Error");
    });
  });

  describe("edge cases and fallbacks", () => {
    it("should return string 'undefined' when passed undefined", () => {
      expect(safeStringify(undefined)).toBe("undefined");
    });

    it("should return a string when passed a function", () => {
      const fn = (): void => {};
      const result = safeStringify(fn);
      expect(typeof result).toBe("string");
    });

    it("should gracefully return a string representation when a property getter throws", () => {
      const faultyObj = {
        name: "test",
        get throwingProperty(): string {
          throw new Error("Getter exploded");
        },
      };

      const result = safeStringify(faultyObj);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
