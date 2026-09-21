import { describe, expect, it } from "vitest";
import { getCheckoutIframeDomain } from "./getCheckoutIframeDomain";

describe("getCheckoutIframeDomain", () => {
  it("strips the Checkout V1 subdomain", () => {
    expect(getCheckoutIframeDomain("https://securecheckout.hit-pay.com/payment-request/@merchant/abc")).toBe(
      "hit-pay.com"
    );
  });

  it("strips the Checkout V2 subdomain", () => {
    expect(getCheckoutIframeDomain("https://checkout.hit-pay.com/payment-request/@merchant/abc")).toBe(
      "hit-pay.com"
    );
  });

  it("strips the Checkout V1 sandbox subdomain", () => {
    expect(getCheckoutIframeDomain("https://securecheckout.sandbox.hit-pay.com/payment-request/abc")).toBe(
      "sandbox.hit-pay.com"
    );
  });

  it("strips the Checkout V2 sandbox subdomain", () => {
    expect(getCheckoutIframeDomain("https://checkout.sandbox.hit-pay.com/payment-request/abc")).toBe(
      "sandbox.hit-pay.com"
    );
  });

  it("returns the hostname unchanged when there is no checkout subdomain", () => {
    expect(getCheckoutIframeDomain("https://hit-pay.com/payment-request/abc")).toBe("hit-pay.com");
  });

  it("only strips a leading checkout subdomain label", () => {
    expect(getCheckoutIframeDomain("https://pay.checkout.hit-pay.com/abc")).toBe("pay.checkout.hit-pay.com");
  });

  it("returns undefined for a malformed URL", () => {
    expect(getCheckoutIframeDomain("not-a-url")).toBeUndefined();
  });

  it("returns undefined for an empty string", () => {
    expect(getCheckoutIframeDomain("")).toBeUndefined();
  });
});
