import { describe, expect, it } from "vitest";
import { truncate, truncateOnWord } from "./text";

describe("Text util tests", () => {
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

  describe("fn: truncateOnWord", () => {
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
        const result = truncateOnWord(input, maxLength);

        expect(result).toEqual(expected);
      }
    });

    it("should return the truncated text on the last word when it is longer than the max length", () => {
      const cases = [
        {
          input: "The quick brown fox jumps over the lazy dog",
          maxLength: 12,
          expected: "The quick...",
        },
        {
          input: "Cal.com is the scheduling infrastructure for everyone",
          maxLength: 14,
          expected: "Cal.com is...",
        },
      ];

      for (const { input, maxLength, expected } of cases) {
        const result = truncateOnWord(input, maxLength);

        expect(result).toEqual(expected);
      }
    });

    it("should return the truncated text without ellipsis when it is longer than the max length and ellipsis is false", () => {
      const cases = [
        {
          input: "The quick brown fox jumps over the lazy dog",
          maxLength: 12,
          ellipsis: false,
          expected: "The quick",
        },
      ];

      for (const { input, maxLength, ellipsis, expected } of cases) {
        const result = truncateOnWord(input, maxLength, ellipsis);

        expect(result).toEqual(expected);
      }
    });

    it("should fallback to character truncation when no spaces are present in the truncated segment", () => {
      const cases = [
        {
          input: "supercalifragilisticexpialidocious",
          maxLength: 10,
          expected: "supercalif...",
        },
        {
          input: "https://cal.com/pro/30min/extremely-long-url-without-any-spaces",
          maxLength: 20,
          expected: "https://cal.com/pro/...",
        },
      ];

      for (const { input, maxLength, expected } of cases) {
        const result = truncateOnWord(input, maxLength);
        expect(result).toEqual(expected);
      }
    });
  });
});
