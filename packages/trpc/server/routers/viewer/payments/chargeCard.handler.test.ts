import { describe, it, expect, vi, beforeEach } from "vitest";

import { handleNoShowFee } from "@calcom/features/bookings/lib/payment/handleNoShowFee";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";

import { TRPCError } from "@trpc/server";

import { chargeCardHandler } from "./chargeCard.handler";

const mockGetBookingForPaymentProcessing = vi.fn();

vi.mock("@calcom/features/bookings/lib/payment/handleNoShowFee", () => ({
  handleNoShowFee: vi.fn(),
}));

vi.mock("@calcom/features/bookings/repositories/BookingRepository", () => {
  return {
    BookingRepository: vi.fn().mockImplementation(() => ({
      getBookingForPaymentProcessing: mockGetBookingForPaymentProcessing,
    })),
  };
});

describe("chargeCardHandler", () => {
  const mockCtx = {
    user: {
      id: 1,
      name: "Test Host",
      email: "host@example.com",
    },
    prisma: {} as any,
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws NOT_FOUND when booking does not exist", async () => {
    mockGetBookingForPaymentProcessing.mockResolvedValue(null);

    await expect(
      chargeCardHandler({
        ctx: mockCtx,
        input: { bookingId: 123 },
      })
    ).rejects.toThrow(
      new TRPCError({
        code: "NOT_FOUND",
        message: "Booking not found",
      })
    );
  });

  it("throws BAD_REQUEST when payment is already marked successful", async () => {
    mockGetBookingForPaymentProcessing.mockResolvedValue({
      id: 123,
      payment: [{ id: 1, success: true }],
    });

    await expect(
      chargeCardHandler({
        ctx: mockCtx,
        input: { bookingId: 123 },
      })
    ).rejects.toThrow(
      new TRPCError({
        code: "BAD_REQUEST",
        message: "The no show fee for 123 has already been charged.",
      })
    );
  });

  it("calls handleNoShowFee when booking and unpaid payment exist", async () => {
    const mockBooking = {
      id: 123,
      payment: [{ id: 1, success: false, amount: 5000, currency: "USD" }],
    };
    mockGetBookingForPaymentProcessing.mockResolvedValue(mockBooking);
    vi.mocked(handleNoShowFee).mockResolvedValue(undefined as any);

    await chargeCardHandler({
      ctx: mockCtx,
      input: { bookingId: 123 },
    });

    expect(handleNoShowFee).toHaveBeenCalledWith({
      booking: mockBooking,
      payment: mockBooking.payment[0],
    });
  });

  it("handles ChargeCardFailure with a BAD_REQUEST TRPCError", async () => {
    const mockBooking = {
      id: 123,
      payment: [{ id: 1, success: false }],
    };
    mockGetBookingForPaymentProcessing.mockResolvedValue(mockBooking);
    vi.mocked(handleNoShowFee).mockRejectedValue(
      new ErrorWithCode("Card was declined by the issuer", ErrorCode.ChargeCardFailure)
    );

    await expect(
      chargeCardHandler({
        ctx: mockCtx,
        input: { bookingId: 123 },
      })
    ).rejects.toThrow(
      new TRPCError({
        code: "BAD_REQUEST",
        message: "Card was declined by the issuer",
      })
    );
  });

  it("handles generic internal errors with INTERNAL_SERVER_ERROR", async () => {
    const mockBooking = {
      id: 123,
      payment: [{ id: 1, success: false }],
    };
    mockGetBookingForPaymentProcessing.mockResolvedValue(mockBooking);
    vi.mocked(handleNoShowFee).mockRejectedValue(new Error("Stripe network timeout"));

    await expect(
      chargeCardHandler({
        ctx: mockCtx,
        input: { bookingId: 123 },
      })
    ).rejects.toThrow(
      new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to charge no show fee for 123",
      })
    );
  });
});
