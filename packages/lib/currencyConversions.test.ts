import { describe, expect, it } from "vitest";

import {
  convertFromSmallestToPresentableCurrencyUnit,
  convertToSmallestCurrencyUnit,
  formatPrice,
} from "./currencyConversions";

describe("currencyConversions", () => {
  describe("convertFromSmallestToPresentableCurrencyUnit", () => {
    it("should return unscaled amount for zero-decimal currencies", () => {
      const zeroDecimalCurrencies = [
        "BIF",
        "CLP",
        "DJF",
        "GNF",
        "JPY",
        "KMF",
        "KRW",
        "MGA",
        "PYG",
        "RWF",
        "UGX",
        "VND",
        "VUV",
        "XAF",
        "XOF",
        "XPF",
      ];

      for (const currency of zeroDecimalCurrencies) {
        expect(convertFromSmallestToPresentableCurrencyUnit(5000, currency)).toBe(5000);
        expect(convertFromSmallestToPresentableCurrencyUnit(5000, currency.toLowerCase())).toBe(5000);
      }
    });

    it("should divide by 100 for standard two-decimal currencies", () => {
      expect(convertFromSmallestToPresentableCurrencyUnit(5000, "USD")).toBe(50);
      expect(convertFromSmallestToPresentableCurrencyUnit(5000, "EUR")).toBe(50);
      expect(convertFromSmallestToPresentableCurrencyUnit(5000, "GBP")).toBe(50);
      expect(convertFromSmallestToPresentableCurrencyUnit(250, "USD")).toBe(2.5);
    });

    it("should safely handle undefined currency without throwing", () => {
      expect(convertFromSmallestToPresentableCurrencyUnit(5000, undefined)).toBe(50);
    });
  });

  describe("convertToSmallestCurrencyUnit", () => {
    it("should return unscaled amount for zero-decimal currencies", () => {
      expect(convertToSmallestCurrencyUnit(5000, "JPY")).toBe(5000);
      expect(convertToSmallestCurrencyUnit(5000, "jpy")).toBe(5000);
      expect(convertToSmallestCurrencyUnit(50000, "KRW")).toBe(50000);
      expect(convertToSmallestCurrencyUnit(200000, "VND")).toBe(200000);
    });

    it("should multiply by 100 for standard two-decimal currencies", () => {
      expect(convertToSmallestCurrencyUnit(50, "USD")).toBe(5000);
      expect(convertToSmallestCurrencyUnit(50, "EUR")).toBe(5000);
      expect(convertToSmallestCurrencyUnit(50, "GBP")).toBe(5000);
    });

    it("should safely handle undefined currency without throwing", () => {
      expect(convertToSmallestCurrencyUnit(50, undefined)).toBe(5000);
    });
  });

  describe("formatPrice", () => {
    it("should correctly format zero-decimal currencies without dividing by 100", () => {
      const formattedJpy = formatPrice(5000, "JPY", "en");
      expect(formattedJpy).toContain("5,000");

      const formattedKrw = formatPrice(50000, "KRW", "en");
      expect(formattedKrw).toContain("50,000");
    });

    it("should correctly format two-decimal currencies dividing by 100", () => {
      const formattedUsd = formatPrice(5000, "USD", "en");
      expect(formattedUsd).toContain("50.00");
    });
  });
});
