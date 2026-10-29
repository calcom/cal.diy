import { handleNoShowFee } from "@calcom/features/bookings/lib/payment/handleNoShowFee";
import { BookingRepository } from "@calcom/features/bookings/repositories/BookingRepository";
import type { PrismaClient } from "@calcom/prisma";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcSessionUser } from "../../../types";
import { chargeCardHandler } from "./chargeCard.handler";

vi.mock("@calcom/features/bookings/lib/payment/handleNoShowFee");
vi.mock("@calcom/features/bookings/repositories/BookingRepository");

describe("chargeCardHandler", () => {
  const ctx = {
    user: { id: 1 } as NonNullable<TrpcSessionUser>,
    prisma: {} as PrismaClient,
  };

  const mockBooking = {
    id: 10,
    userId: 1,
    startTime: new Date(Date.now() - 60 * 60 * 1000),
    payment: [{ id: 1, amount: 5000, currency: "usd", paymentOption: "HOLD", appId: "stripe", success: false }],
  };

  const mockBookingRepo = {
    getBookingForPaymentProcessing: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(BookingRepository).mockImplementation(function () {
      return mockBookingRepo;
    });
    mockBookingRepo.getBookingForPaymentProcessing.mockResolvedValue(mockBooking);
  });

  it("throws UNAUTHORIZED and does not charge when the user is not the organizer", async () => {
    mockBookingRepo.getBookingForPaymentProcessing.mockResolvedValue({ ...mockBooking, userId: 2 });

    await expect(chargeCardHandler({ ctx, input: { bookingId: 10 } })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(handleNoShowFee).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the booking does not exist", async () => {
    mockBookingRepo.getBookingForPaymentProcessing.mockResolvedValue(null);

    await expect(chargeCardHandler({ ctx, input: { bookingId: 10 } })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(handleNoShowFee).not.toHaveBeenCalled();
  });

  it("throws BAD_REQUEST and does not charge before the booking has started", async () => {
    mockBookingRepo.getBookingForPaymentProcessing.mockResolvedValue({
      ...mockBooking,
      startTime: new Date(Date.now() + 60 * 60 * 1000),
    });

    await expect(chargeCardHandler({ ctx, input: { bookingId: 10 } })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "no_show_fee_charge_before_start",
    });
    expect(handleNoShowFee).not.toHaveBeenCalled();
  });

  it("charges the card when the user is the organizer", async () => {
    await chargeCardHandler({ ctx, input: { bookingId: 10 } });

    expect(handleNoShowFee).toHaveBeenCalledWith({ booking: mockBooking, payment: mockBooking.payment[0] });
  });

  it("throws BAD_REQUEST when the no-show fee was already charged", async () => {
    mockBookingRepo.getBookingForPaymentProcessing.mockResolvedValue({
      ...mockBooking,
      payment: [{ ...mockBooking.payment[0], success: true }],
    });

    await expect(chargeCardHandler({ ctx, input: { bookingId: 10 } })).rejects.toBeInstanceOf(TRPCError);
    expect(handleNoShowFee).not.toHaveBeenCalled();
  });
});
