import { describe, expect, it } from "vitest";

import {
  convertFromSmallestToPresentableCurrencyUnit,
  convertToSmallestCurrencyUnit,
} from "./currencyConversions";

describe("currencyConversions", () => {
  describe("convertFromSmallestToPresentableCurrencyUnit", () => {
    it("converts two-decimal currencies by dividing by 100", () => {
      expect(convertFromSmallestToPresentableCurrencyUnit(1000, "USD")).toBe(10);
      expect(convertFromSmallestToPresentableCurrencyUnit(2550, "EUR")).toBe(25.5);
    });

    it("leaves zero-decimal currencies unchanged", () => {
      expect(convertFromSmallestToPresentableCurrencyUnit(1000, "JPY")).toBe(1000);
      expect(convertFromSmallestToPresentableCurrencyUnit(5000, "KRW")).toBe(5000);
      expect(convertFromSmallestToPresentableCurrencyUnit(20000, "VND")).toBe(20000);
    });
  });

  describe("convertToSmallestCurrencyUnit", () => {
    it("converts two-decimal currencies by multiplying by 100", () => {
      expect(convertToSmallestCurrencyUnit(10, "USD")).toBe(1000);
      expect(convertToSmallestCurrencyUnit(25.5, "EUR")).toBe(2550);
    });

    it("leaves zero-decimal currencies unchanged", () => {
      expect(convertToSmallestCurrencyUnit(1000, "JPY")).toBe(1000);
      expect(convertToSmallestCurrencyUnit(5000, "KRW")).toBe(5000);
    });
  });
});
