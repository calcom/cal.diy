import axios from "axios";
import qs from "qs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BuildPaymentService } from "./PaymentService";

vi.mock("axios");

const paymentCreate = vi.fn<(args: { data: { amount: number } }) => void>();

vi.mock("@calcom/prisma", () => ({
  default: {
    booking: {
      findUnique: vi.fn(async () => ({
        uid: "booking-uid",
        title: "Paid event",
        startTime: new Date("2026-04-01T10:00:00.000Z"),
        endTime: new Date("2026-04-01T10:30:00.000Z"),
        eventTypeId: 1,
        eventType: { slug: "paid-event", seatsPerTimeSlot: null },
        attendees: [],
      })),
      findMany: vi.fn(async () => []),
    },
    payment: {
      create: (args: { data: { amount: number } }) => {
        paymentCreate(args);
        return { id: 1, ...args.data };
      },
    },
  },
}));

const credentials = {
  key: { isSandbox: true, sandbox: { apiKey: "test-api-key", saltKey: "test-salt-key" } },
};

/**
 * HitPay's payment-requests API takes `amount` as a decimal string in major units and echoes it
 * back the same way, so both directions have to respect zero-decimal currencies. Those are stored
 * unscaled by `convertToSmallestCurrencyUnit`, which is what the price input writes.
 * https://docs.hitpayapp.com/apis/payment-request/create-request
 */
const createPaymentWith = async ({
  amount,
  currency,
}: {
  amount: number;
  currency: string;
}): Promise<{ sent: string; stored: number }> => {
  // Echo back whatever amount was actually requested, the way HitPay would.
  vi.mocked(axios.post).mockImplementation(async (_url, body) => ({
    data: {
      id: "hitpay-request-id",
      amount: (qs.parse(body as string) as { amount: string }).amount,
      currency,
    },
  }));
  vi.mocked(axios.get).mockResolvedValue({
    data: { data: [{ url: "https://securecheckout.sandbox.hit-pay.com/payment-request/test" }] },
  });

  await BuildPaymentService(credentials).create(
    { amount, currency },
    1,
    101,
    "organizer",
    "Booker",
    "ON_BOOKING",
    "booker@example.com"
  );

  const requestBody = qs.parse(vi.mocked(axios.post).mock.calls[0][1] as string) as { amount: string };

  return { sent: requestBody.amount, stored: paymentCreate.mock.calls[0][0].data.amount };
};

describe("HitPayPaymentService.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // JPY, KRW and VND have no minor unit, so the stored amount is already the amount to charge.
  // Scaling it down bills the attendee 1% of the price.
  it.each([
    { currency: "jpy", amount: 10000 },
    { currency: "krw", amount: 50000 },
    { currency: "vnd", amount: 200000 },
  ])("charges $currency unscaled and round-trips the stored amount", async ({ currency, amount }) => {
    expect(await createPaymentWith({ amount, currency })).toEqual({ sent: `${amount}`, stored: amount });
  });

  it.each([
    { currency: "usd", amount: 5000, sent: "50" },
    { currency: "sgd", amount: 5000, sent: "50" },
  ])("converts $currency from minor units", async ({ currency, amount, sent }) => {
    expect(await createPaymentWith({ amount, currency })).toEqual({ sent, stored: amount });
  });
});
