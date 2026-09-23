import { describe, expect, it } from "vitest";

import { truncate, truncateOnWord } from "./text";

describe("Text util tests", () => {
  describe("fn: truncateOnWord", () => {
    it("should respect the maxLength parameter instead of a hardcoded constant", () => {
      const text = "the quick brown fox jumps over the lazy dog ".repeat(10);
      const result158 = truncateOnWord(text, 158);
      const result100 = truncateOnWord(text, 100);
      expect(result158.length).toBeLessThanOrEqual(158 + 3);
      expect(result100.length).toBeLessThanOrEqual(100 + 3);
      expect(result158).not.toBe("...");
      expect(result100).not.toBe("...");
    });

    it("should preserve text when no space exists within maxLength", () => {
      const text = "a".repeat(200);
      const result = truncateOnWord(text, 100);
      expect(result).toBe("a".repeat(100) + "...");
    });

    it("should return the original text when shorter than maxLength", () => {
      expect(truncateOnWord("short", 100)).toBe("short");
    });
  });

  describe("fn: truncate", () => {
    it("should return the original text when it is shorter than the max length", () => {
      const cases = [
        {
          input: "Hello world",
          maxLength: 100,
          expected: "Hello world",
        },
        {
          input: "Hello world",
          maxLength: 11,
          expected: "Hello world",
        },
      ];

      for (const { input, maxLength, expected } of cases) {
        const result = truncate(input, maxLength);

        expect(result).toEqual(expected);
      }
    });

    it("should return the truncated text when it is longer than the max length", () => {
      const cases = [
        {
          input: "Hello world",
          maxLength: 10,
          expected: "Hello w...",
        },
        {
          input: "Hello world",
          maxLength: 5,
          expected: "He...",
        },
      ];

      for (const { input, maxLength, expected } of cases) {
        const result = truncate(input, maxLength);

        expect(result).toEqual(expected);
      }
    });

    it("should return the truncated text without ellipsis when it is longer than the max length and ellipsis is false", () => {
      const cases = [
        {
          input: "Hello world",
          maxLength: 10,
          ellipsis: false,
          expected: "Hello w",
        },
        {
          input: "Hello world",
          maxLength: 5,
          ellipsis: false,
          expected: "He",
        },
      ];

      for (const { input, maxLength, ellipsis, expected } of cases) {
        const result = truncate(input, maxLength, ellipsis);

        expect(result).toEqual(expected);
      }
    });
  });
});
