import type { NextApiRequest, NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import handler from "./capture";

const { captureOrderMock, prismaMock } = vi.hoisted(() => ({
  captureOrderMock: vi.fn(),
  prismaMock: {
    booking: { findUnique: vi.fn(), update: vi.fn() },
    payment: { update: vi.fn() },
  },
}));

vi.mock("@calcom/prisma", () => ({ default: prismaMock, prisma: prismaMock }));

vi.mock("@calcom/app-store/paypal/api/webhook", () => ({
  findPaymentCredentials: vi.fn().mockResolvedValue({ clientId: "client-id", secretKey: "secret-key" }),
}));

vi.mock("@calcom/app-store/paypal/lib/Paypal", () => ({
  default: class {
    captureOrder = captureOrderMock;
  },
}));

// The non-production branch is the one that marks the booking as paid without a webhook.
vi.mock("@calcom/lib/constants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@calcom/lib/constants")>()),
  IS_PRODUCTION: false,
}));

describe("paypal capture handler", () => {
  beforeEach(() => {
    prismaMock.booking.findUnique.mockResolvedValue({ id: 1, userId: 2 });
  });

  it("redirects a failed capture without marking the booking or payment as paid", async () => {
    captureOrderMock.mockResolvedValue(false);
    const redirect = vi.fn();
    const req = { method: "GET", query: { bookingUid: "booking-uid", token: "order-token" } };
    const res = { redirect };

    await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);

    expect(captureOrderMock).toHaveBeenCalledWith("order-token");
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith("/booking/booking-uid?paypalPaymentStatus=failed");
    expect(prismaMock.booking.update).not.toHaveBeenCalled();
    expect(prismaMock.payment.update).not.toHaveBeenCalled();
  });
});
