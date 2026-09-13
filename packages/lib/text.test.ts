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
    it("should return the original text when it is shorter than or equal to the max length", () => {
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
        expect(truncateOnWord(input, maxLength)).toEqual(expected);
      }
    });

    it("should break on the last word boundary when spaces exist", () => {
      const text = "The quick brown fox jumps over the lazy dog";
      const result = truncateOnWord(text, 20);

      expect(result).toEqual("The quick brown...");
      expect(result.length).toBeLessThanOrEqual(20);
    });

    it("should honour the maxLength argument and not be capped at 148", () => {
      const text = "word ".repeat(50); // 250 characters
      const resShort = truncateOnWord(text, 30);
      const resLong = truncateOnWord(text, 180);

      expect(resShort.length).toBeLessThanOrEqual(30);
      expect(resLong.length).toBeLessThanOrEqual(180);
      expect(resLong.length).toBeGreaterThan(148);
    });

    it("should fall back to a hard cut for languages without spaces instead of returning just '...'", () => {
      const chinese = "這是一個非常長的預約活動說明文字，完全沒有任何空格測試截斷功能";
      const resZh = truncateOnWord(chinese, 20);

      expect(resZh).not.toEqual("...");
      expect(resZh).toEqual("這是一個非常長的預約活動說明文字，...");
      expect(resZh.length).toBeLessThanOrEqual(20);

      const japanese = "予約ページの説明文です。非常に長いテキストが続きます。";
      const resJa = truncateOnWord(japanese, 15);

      expect(resJa).not.toEqual("...");
      expect(resJa.length).toBeLessThanOrEqual(15);

      const url = "https://example.com/very/long/url/without/spaces/that/needs/to/be/truncated";
      const resUrl = truncateOnWord(url, 25);

      expect(resUrl).not.toEqual("...");
      expect(resUrl.length).toBeLessThanOrEqual(25);
    });

    it("should return the truncated text without ellipsis when ellipsis is false", () => {
      const chinese = "這是一個非常長的預約活動說明文字";
      expect(truncateOnWord(chinese, 10, false)).toEqual("這是一個非常長的預約");

      const english = "Hello world this is a test";
      expect(truncateOnWord(english, 15, false)).toEqual("Hello world");
    });

    it("should handle edge cases where maxLength is small or zero", () => {
      expect(truncateOnWord("Hello", 0)).toEqual("");
      expect(truncateOnWord("Hello", -5)).toEqual("");
      expect(truncateOnWord("Hello world", 2)).toEqual("He");
    });
  });
});
