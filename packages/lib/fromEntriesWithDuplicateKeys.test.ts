import { describe, expect, it } from "vitest";

import { fromEntriesWithDuplicateKeys } from "./fromEntriesWithDuplicateKeys";

describe("fromEntriesWithDuplicateKeys", () => {
  it("returns an empty object for null", () => {
    expect(fromEntriesWithDuplicateKeys(null)).toEqual({});
  });

  it("returns an empty object for an empty iterator", () => {
    expect(fromEntriesWithDuplicateKeys(new URLSearchParams("").entries())).toEqual({});
  });

  it("maps unique keys to plain string values", () => {
    expect(fromEntriesWithDuplicateKeys(new URLSearchParams("a=1&b=2").entries())).toEqual({
      a: "1",
      b: "2",
    });
  });

  it("collects duplicate keys into an array", () => {
    expect(fromEntriesWithDuplicateKeys(new URLSearchParams("a=1&a=2&b=3").entries())).toEqual({
      a: ["1", "2"],
      b: "3",
    });
  });

  it("keeps appending for more than two duplicates, preserving order", () => {
    expect(fromEntriesWithDuplicateKeys(new URLSearchParams("a=1&a=2&a=3").entries())).toEqual({
      a: ["1", "2", "3"],
    });
  });

  it("keeps empty string values", () => {
    expect(fromEntriesWithDuplicateKeys(new URLSearchParams("a=&a=1").entries())).toEqual({
      a: ["", "1"],
    });
  });
});
