import { describe, expect, it } from "vitest";
import isPrismaObj, { isPrismaObjOrUndefined } from "./isPrismaObj";

describe("isPrismaObj", () => {
  it("returns true for plain objects", () => {
    expect(isPrismaObj({})).toBe(true);
    expect(isPrismaObj({ key: "value" })).toBe(true);
    expect(isPrismaObj({ nested: { a: 1 } })).toBe(true);
  });

  it("returns false for null and undefined", () => {
    expect(isPrismaObj(null)).toBe(false);
    expect(isPrismaObj(undefined)).toBe(false);
  });

  it("returns false for arrays", () => {
    expect(isPrismaObj([])).toBe(false);
    expect(isPrismaObj([1, 2, 3])).toBe(false);
    expect(isPrismaObj([{ a: 1 }])).toBe(false);
  });

  it("returns false for primitives", () => {
    expect(isPrismaObj("string")).toBe(false);
    expect(isPrismaObj(123)).toBe(false);
    expect(isPrismaObj(0)).toBe(false);
    expect(isPrismaObj(true)).toBe(false);
    expect(isPrismaObj(false)).toBe(false);
    expect(isPrismaObj(Symbol("test"))).toBe(false);
  });

  it("returns false for functions", () => {
    expect(isPrismaObj(() => {})).toBe(false);
    expect(isPrismaObj(function () {})).toBe(false);
  });
});

describe("isPrismaObjOrUndefined", () => {
  it("returns the object when input is a valid object", () => {
    const obj = { foo: "bar" };
    expect(isPrismaObjOrUndefined(obj)).toEqual({ foo: "bar" });
    expect(isPrismaObjOrUndefined({})).toEqual({});
  });

  it("returns undefined for null and undefined", () => {
    expect(isPrismaObjOrUndefined(null)).toBeUndefined();
    expect(isPrismaObjOrUndefined(undefined)).toBeUndefined();
  });

  it("returns undefined for arrays and primitives", () => {
    expect(isPrismaObjOrUndefined([])).toBeUndefined();
    expect(isPrismaObjOrUndefined([1, 2])).toBeUndefined();
    expect(isPrismaObjOrUndefined("string")).toBeUndefined();
    expect(isPrismaObjOrUndefined(123)).toBeUndefined();
    expect(isPrismaObjOrUndefined(true)).toBeUndefined();
  });
});
