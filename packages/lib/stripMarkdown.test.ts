import { describe, expect, it } from "vitest";

import { stripMarkdown } from "./stripMarkdown";

describe("stripMarkdown", () => {
  it("should strip markdown headers, bold, italics, and links", () => {
    const md = "# Title\n\nThis is **bold** and *italic* with a [link](https://example.com).";
    const result = stripMarkdown(md);
    expect(result).toBe("Title\n\nThis is bold and italic with a link.");
  });

  it("should strip list markers, blockquotes and code fences", () => {
    const md = "> quoted\n\n- one\n- two\n\n`code`";
    expect(stripMarkdown(md)).not.toMatch(/[>`]|^- /m);
  });

  it("should leave plain text untouched", () => {
    expect(stripMarkdown("just plain text")).toBe("just plain text");
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an empty string", ""],
  ])("should return an empty string for %s", (_label, input) => {
    expect(stripMarkdown(input)).toBe("");
  });

  it.each([
    ["a number", 42],
    ["an object", {}],
    ["an array", []],
    ["a boolean", true],
  ])("should return an empty string for %s instead of throwing", (_label, input) => {
    // remove-markdown calls .replace() on its argument, so these reach it as
    // "output.replace is not a function".
    expect(() => stripMarkdown(input as unknown as string)).not.toThrow();
    expect(stripMarkdown(input as unknown as string)).toBe("");
  });

  it("should always return a string", () => {
    for (const input of ["# Title", "", null, undefined, 42, {}]) {
      expect(typeof stripMarkdown(input as unknown as string)).toBe("string");
    }
  });
});
