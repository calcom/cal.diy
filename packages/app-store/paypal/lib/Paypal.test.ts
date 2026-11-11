import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "vitest-fetch-mock";

import Paypal from "./Paypal";

vi.mock("@calcom/prisma", () => ({
  default: {},
  prisma: {},
}));

const ORDER_ENDPOINT = "/v2/checkout/orders";

const createOrderWith = async ({
  amount,
  currency,
}: {
  amount: number;
  currency: string;
}): Promise<{ currency_code: string; value: string }> => {
  fetchMock.resetMocks();
  // First fetch is the OAuth token request, second is the order creation.
  fetchMock.mockResponseOnce(JSON.stringify({ access_token: "test-token", expires_in: 3600 }));
  fetchMock.mockResponseOnce(JSON.stringify({ id: "TEST_ORDER_ID" }));

  const paypal = new Paypal({ clientId: "test-client-id", secretKey: "test-secret-key" });

  await paypal.createOrder({
    referenceId: "test-reference-id",
    amount,
    currency,
    returnUrl: "https://example.com/return",
    cancelUrl: "https://example.com/cancel",
  });

  const orderCall = fetchMock.mock.calls.find(([url]) => String(url).includes(ORDER_ENDPOINT));
  if (!orderCall) throw new Error("Order creation request was never made");

  return JSON.parse(String(orderCall[1]?.body)).purchase_units[0].amount;
};

describe("Paypal.createOrder", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // JPY is stored unscaled by `convertToSmallestCurrencyUnit`, so the stored amount is
  // already the amount to charge. Scaling it down bills the attendee 1% of the price.
  it("sends JPY amounts unscaled", async () => {
    expect(await createOrderWith({ amount: 1000, currency: "JPY" })).toEqual({
      currency_code: "JPY",
      value: "1000",
    });
  });

  // HUF and TWD also reject decimals at PayPal, but `convertToSmallestCurrencyUnit` stores
  // them scaled, so they must keep going through the minor-unit conversion.
  // https://developer.paypal.com/api/rest/reference/currency-codes/
  it.each([
    { currency: "USD", amount: 1000, expected: "10" },
    { currency: "EUR", amount: 1050, expected: "10.5" },
    { currency: "HUF", amount: 5000, expected: "50" },
    { currency: "TWD", amount: 300, expected: "3" },
  ])("converts $currency amounts from minor units", async ({ currency, amount, expected }) => {
    expect(await createOrderWith({ amount, currency })).toEqual({
      currency_code: currency,
      value: expected,
    });
  });
});

describe("Paypal.getAccessToken", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    fetchMock.resetMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("caches the token for expires_in seconds converted to milliseconds", async () => {
    fetchMock
      .mockResponseOnce(JSON.stringify({ access_token: "token-1", expires_in: 3600 }))
      .mockResponseOnce(JSON.stringify({ access_token: "token-2", expires_in: 3600 }));

    const paypal = new Paypal({ clientId: "test-client-id", secretKey: "test-secret-key" });

    await paypal.getAccessToken();
    expect(paypal.accessToken).toBe("token-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 60s exceeds the old ms bug (3600ms) but is still well within the 3600s TTL.
    await vi.advanceTimersByTimeAsync(60 * 1000);
    await paypal.getAccessToken();
    expect(paypal.accessToken).toBe("token-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3600 * 1000);
    await paypal.getAccessToken();
    expect(paypal.accessToken).toBe("token-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
