import { describe, expect, it } from "vitest";
import { uniqueBy } from "./array";

describe("uniqueBy", () => {
  it("should remove duplicates based on single key", () => {
    const input = [
      { id: 1, name: "John" },
      { id: 1, name: "Jane" },
      { id: 2, name: "Doe" },
    ];

    const result = uniqueBy(input, ["id"]);
    expect(result).toHaveLength(2);
    expect(result).toEqual([
      { id: 1, name: "John" },
      { id: 2, name: "Doe" },
    ]);
  });

  it("should remove duplicates based on multiple keys", () => {
    const input = [
      { id: 1, type: "A", value: "first" },
      { id: 1, type: "A", value: "second" },
      { id: 1, type: "B", value: "third" },
      { id: 2, type: "A", value: "fourth" },
    ];

    const result = uniqueBy(input, ["id", "type"]);
    expect(result).toHaveLength(3);
    expect(result).toEqual([
      { id: 1, type: "A", value: "first" },
      { id: 1, type: "B", value: "third" },
      { id: 2, type: "A", value: "fourth" },
    ]);
  });

  it("should handle empty array", () => {
    const input: Array<{ id: number }> = [];
    const result = uniqueBy(input, ["id"]);
    expect(result).toEqual([]);
  });

  it("should handle array with single item", () => {
    const input = [{ id: 1, name: "John" }];
    const result = uniqueBy(input, ["id"]);
    expect(result).toEqual(input);
  });
});
