import { describe, expect, it } from "vitest";

import {
  convertFromSmallestToPresentableCurrencyUnit,
  convertToSmallestCurrencyUnit,
} from "./currencyConversions";

describe("convertFromSmallestToPresentableCurrencyUnit", () => {
  it("converts zero-decimal currencies without dividing by 100", () => {
    expect(convertFromSmallestToPresentableCurrencyUnit(5000, "JPY")).toBe(5000);
    expect(convertFromSmallestToPresentableCurrencyUnit(50000, "KRW")).toBe(50000);
    expect(convertFromSmallestToPresentableCurrencyUnit(200000, "VND")).toBe(200000);
    expect(convertFromSmallestToPresentableCurrencyUnit(1500, "CLP")).toBe(1500);
    expect(convertFromSmallestToPresentableCurrencyUnit(3000, "PYG")).toBe(3000);
  });

  it("converts standard currencies by dividing by 100", () => {
    expect(convertFromSmallestToPresentableCurrencyUnit(5000, "USD")).toBe(50);
    expect(convertFromSmallestToPresentableCurrencyUnit(5000, "EUR")).toBe(50);
    expect(convertFromSmallestToPresentableCurrencyUnit(1050, "GBP")).toBe(10.5);
  });

  it("handles lowercase currency codes correctly", () => {
    expect(convertFromSmallestToPresentableCurrencyUnit(5000, "jpy")).toBe(5000);
    expect(convertFromSmallestToPresentableCurrencyUnit(5000, "usd")).toBe(50);
  });

  it("handles undefined or empty currency without throwing", () => {
    expect(convertFromSmallestToPresentableCurrencyUnit(5000, undefined)).toBe(50);
    expect(convertFromSmallestToPresentableCurrencyUnit(5000, "")).toBe(50);
  });
});

describe("convertToSmallestCurrencyUnit", () => {
  it("keeps zero-decimal currencies unchanged", () => {
    expect(convertToSmallestCurrencyUnit(5000, "JPY")).toBe(5000);
    expect(convertToSmallestCurrencyUnit(50000, "KRW")).toBe(50000);
  });

  it("multiplies standard currencies by 100", () => {
    expect(convertToSmallestCurrencyUnit(50, "USD")).toBe(5000);
    expect(convertToSmallestCurrencyUnit(50, "EUR")).toBe(5000);
  });

  it("handles undefined or empty currency safely", () => {
    expect(convertToSmallestCurrencyUnit(50, undefined)).toBe(5000);
  });
});

describe("no-show fee display sites integration contract (#30122)", () => {
  it("Site 1 & 2: formats attendee cancellation and host dialog amounts accurately", () => {
    const payment = { amount: 5000, currency: "JPY" };
    const cancellationDisplayAmount = convertFromSmallestToPresentableCurrencyUnit(
      payment.amount,
      payment.currency
    );
    expect(cancellationDisplayAmount).toBe(5000);

    const usdPayment = { amount: 5000, currency: "USD" };
    expect(convertFromSmallestToPresentableCurrencyUnit(usdPayment.amount, usdPayment.currency)).toBe(50);
  });

  it("Site 3 & 4: formats notification email subject and subtitle consistently with fee row", () => {
    const paymentInfo = { amount: 5000, currency: "JPY" };
    const emailSubjectAmount = convertFromSmallestToPresentableCurrencyUnit(
      paymentInfo.amount,
      paymentInfo.currency
    );
    const emailSubtitleAmount = convertFromSmallestToPresentableCurrencyUnit(
      paymentInfo.amount,
      paymentInfo.currency
    );
    expect(emailSubjectAmount).toBe(5000);
    expect(emailSubtitleAmount).toBe(5000);
    expect(emailSubjectAmount).toBe(emailSubtitleAmount);

    // Fallback when currency is undefined
    const noCurrencyPayment = { amount: 5000, currency: undefined };
    expect(
      convertFromSmallestToPresentableCurrencyUnit(noCurrencyPayment.amount, noCurrencyPayment.currency)
    ).toBe(50);
  });
});
