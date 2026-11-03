import { describe, expect, it } from "vitest";

import { getSafe } from "./getSafe";

describe("getSafe", () => {
  it("should safely retrieve nested object property", () => {
    const obj = { a: { b: { c: "hello" } } };
    expect(getSafe<string>(obj, ["a", "b", "c"])).toBe("hello");
  });

  it("should safely retrieve array element", () => {
    const obj = { users: [{ name: "Alice" }, { name: "Bob" }] };
    expect(getSafe<string>(obj, ["users", 1, "name"])).toBe("Bob");
  });

  it("should return undefined for non-existent path", () => {
    const obj = { a: { b: 1 } };
    expect(getSafe(obj, ["a", "x", "y"])).toBeUndefined();
  });

  it("should traverse the shapes the call sites actually pass", () => {
    // bookingSuccessRedirect and determineReschedulePreventionRedirect read booking responses.
    const responses = { name: { firstName: "Ada", lastName: "Lovelace" }, phone: "+5511999998888" };

    expect(getSafe<string>(responses, ["name", "firstName"])).toBe("Ada");
    expect(getSafe<string>(responses, ["phone"])).toBe("+5511999998888");
    expect(getSafe<string>(responses, ["email"])).toBeUndefined();
  });

  it("should return the object itself for an empty path", () => {
    const obj = { a: 1 };
    expect(getSafe(obj, [])).toBe(obj);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
  ])("should return undefined when path is %s", (_label, path) => {
    expect(getSafe({ a: 1 }, path)).toBeUndefined();
  });

  it.each([
    ["a string", "a.b"],
    ["a number", 1],
    ["an object", { 0: "a" }],
  ])("should return undefined when path is %s from untyped code", (_label, path) => {
    expect(() => getSafe({ a: 1 }, path as unknown as string[])).not.toThrow();
    expect(getSafe({ a: 1 }, path as unknown as string[])).toBeUndefined();
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "not an object"],
    ["a number", 42],
  ])("should return undefined when the object is %s", (_label, obj) => {
    expect(() => getSafe(obj, ["a", "b"])).not.toThrow();
    expect(getSafe(obj, ["a", "b"])).toBeUndefined();
  });

  it("should stop at the first non-object rather than throwing", () => {
    expect(getSafe({ a: "string" }, ["a", "b", "c"])).toBeUndefined();
    expect(getSafe({ a: null }, ["a", "b"])).toBeUndefined();
  });
});
