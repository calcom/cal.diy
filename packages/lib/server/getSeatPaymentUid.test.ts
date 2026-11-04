import { describe, expect, it } from "vitest";

import { getSeatPaymentUid } from "./getSeatPaymentUid";

describe("getSeatPaymentUid", () => {
  it("returns the paymentUid stored on a seat's metadata", () => {
    expect(getSeatPaymentUid({ paymentUid: "payment-uid-2" })).toBe("payment-uid-2");
  });

  it("resolves distinct payments for different seats of the same booking", () => {
    // Regression for #29664: each seat of a multi-seat paid booking must surface its own payment,
    // not the booking's first payment.
    const firstSeatMetadata = { paymentUid: "payment-uid-1" };
    const secondSeatMetadata = { paymentUid: "payment-uid-2" };

    expect(getSeatPaymentUid(firstSeatMetadata)).toBe("payment-uid-1");
    expect(getSeatPaymentUid(secondSeatMetadata)).toBe("payment-uid-2");
  });

  it("preserves unrelated metadata fields while reading paymentUid", () => {
    expect(getSeatPaymentUid({ paymentUid: "payment-uid-3", someOtherKey: "value" })).toBe("payment-uid-3");
  });

  it("returns undefined for legacy seats without a stored paymentUid", () => {
    expect(getSeatPaymentUid({ someOtherKey: "value" })).toBeUndefined();
    expect(getSeatPaymentUid({})).toBeUndefined();
  });

  it("returns undefined when there is no seat metadata", () => {
    expect(getSeatPaymentUid(null)).toBeUndefined();
    expect(getSeatPaymentUid(undefined)).toBeUndefined();
  });

  it("returns undefined when metadata is not an object", () => {
    expect(getSeatPaymentUid("not-an-object")).toBeUndefined();
    expect(getSeatPaymentUid(42)).toBeUndefined();
  });

  it("returns undefined when paymentUid is present but not a string", () => {
    expect(getSeatPaymentUid({ paymentUid: 123 })).toBeUndefined();
  });
});
