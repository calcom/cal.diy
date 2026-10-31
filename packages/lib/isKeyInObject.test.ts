import { describe, expect, it } from "vitest";
import { isKeyInObject } from "./isKeyInObject";

describe("isKeyInObject", () => {
  describe("valid own properties", () => {
    it("should return true when a string key exists on the object", () => {
      const obj = { id: 1, name: "Cal", active: true };
      expect(isKeyInObject("id", obj)).toBe(true);
      expect(isKeyInObject("name", obj)).toBe(true);
      expect(isKeyInObject("active", obj)).toBe(true);
    });

    it("should return false when a key does not exist on the object", () => {
      const obj = { id: 1, name: "Cal" };
      expect(isKeyInObject("missing", obj)).toBe(false);
      expect(isKeyInObject("age", obj)).toBe(false);
    });

    it("should support numeric property keys on objects and arrays", () => {
      const obj = { 0: "zero", 1: "one" };
      expect(isKeyInObject(0, obj)).toBe(true);
      expect(isKeyInObject(1, obj)).toBe(true);
      expect(isKeyInObject(2, obj)).toBe(false);

      const arr = ["first", "second"];
      expect(isKeyInObject(0, arr)).toBe(true);
      expect(isKeyInObject(1, arr)).toBe(true);
      expect(isKeyInObject(2, arr)).toBe(false);
    });

    it("should support Symbol property keys", () => {
      const symKey = Symbol("test");
      const obj = { [symKey]: "symbolValue", regular: "value" };
      expect(isKeyInObject(symKey, obj)).toBe(true);
      expect(isKeyInObject(Symbol("other"), obj)).toBe(false);
    });
  });

  describe("null and undefined safety", () => {
    it("should safely return false when object is null without throwing", () => {
      expect(isKeyInObject("id", null)).toBe(false);
    });

    it("should safely return false when object is undefined without throwing", () => {
      expect(isKeyInObject("id", undefined)).toBe(false);
    });
  });

  describe("primitive non-object inputs", () => {
    it("should safely return false for primitive values", () => {
      // @ts-expect-error testing runtime safety for non-object inputs
      expect(isKeyInObject("length", "string")).toBe(false);
      // @ts-expect-error testing runtime safety for non-object inputs
      expect(isKeyInObject("toFixed", 123)).toBe(false);
      // @ts-expect-error testing runtime safety for non-object inputs
      expect(isKeyInObject("valueOf", true)).toBe(false);
    });
  });

  describe("prototype chain protection", () => {
    it("should return false for inherited Object.prototype methods on empty objects", () => {
      const empty = {};
      expect(isKeyInObject("toString", empty)).toBe(false);
      expect(isKeyInObject("valueOf", empty)).toBe(false);
      expect(isKeyInObject("hasOwnProperty", empty)).toBe(false);
      expect(isKeyInObject("constructor", empty)).toBe(false);
    });

    it("should return true if an object explicitly defines an own property with the same name as a prototype method", () => {
      const custom = { toString: "custom string", valueOf: 42 };
      expect(isKeyInObject("toString", custom)).toBe(true);
      expect(isKeyInObject("valueOf", custom)).toBe(true);
    });

    it("should distinguish between own properties and inherited prototype properties", () => {
      const proto = { inheritedField: "protoValue" };
      const child = Object.create(proto);
      child.ownField = "childValue";

      expect(isKeyInObject("ownField", child)).toBe(true);
      expect(isKeyInObject("inheritedField", child)).toBe(false);
    });

    it("should return false for a class method, which lives on the prototype", () => {
      class FeatureFlags {
        enabled = true;
        isEnabled() {
          return this.enabled;
        }
      }
      const flags = new FeatureFlags();

      expect(isKeyInObject("enabled", flags)).toBe(true);
      expect(isKeyInObject("isEnabled", flags)).toBe(false);
    });
  });

  describe("TypeScript type narrowing", () => {
    it("should narrow the key type safely", () => {
      const flags: Record<string, boolean> = { enableNewUI: true, betaTester: false };
      const keyName: string = "enableNewUI";

      if (isKeyInObject(keyName, flags)) {
        const val = flags[keyName];
        expect(val).toBe(true);
      }
    });
  });
});
