import { handleNoShowFee } from "@calcom/features/bookings/lib/payment/handleNoShowFee";
import { BookingRepository } from "@calcom/features/bookings/repositories/BookingRepository";
import { BookingAccessService } from "@calcom/features/bookings/services/BookingAccessService";
import type { PrismaClient } from "@calcom/prisma";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcSessionUser } from "../../../types";
import { chargeCardHandler } from "./chargeCard.handler";

vi.mock("@calcom/features/bookings/lib/payment/handleNoShowFee");
vi.mock("@calcom/features/bookings/repositories/BookingRepository");
vi.mock("@calcom/features/bookings/services/BookingAccessService");

describe("chargeCardHandler", () => {
  const ctx = {
    user: { id: 1 } as NonNullable<TrpcSessionUser>,
    prisma: {} as PrismaClient,
  };

  const mockBooking = {
    id: 10,
    payment: [{ id: 1, amount: 5000, currency: "usd", paymentOption: "HOLD", appId: "stripe", success: false }],
  };

  const mockBookingRepo = {
    getBookingForPaymentProcessing: vi.fn(),
  };

  const mockBookingAccessService = {
    doesUserIdHaveAccessToBooking: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(BookingRepository).mockImplementation(function () {
      return mockBookingRepo;
    });
    vi.mocked(BookingAccessService).mockImplementation(function () {
      return mockBookingAccessService;
    });
    mockBookingRepo.getBookingForPaymentProcessing.mockResolvedValue(mockBooking);
  });

  it("throws UNAUTHORIZED and does not charge when the user has no access to the booking", async () => {
    mockBookingAccessService.doesUserIdHaveAccessToBooking.mockResolvedValue(false);

    await expect(chargeCardHandler({ ctx, input: { bookingId: 10 } })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(mockBookingAccessService.doesUserIdHaveAccessToBooking).toHaveBeenCalledWith({
      userId: 1,
      bookingId: 10,
    });
    expect(mockBookingRepo.getBookingForPaymentProcessing).not.toHaveBeenCalled();
    expect(handleNoShowFee).not.toHaveBeenCalled();
  });

  it("charges the card when the user has access to the booking", async () => {
    mockBookingAccessService.doesUserIdHaveAccessToBooking.mockResolvedValue(true);

    await chargeCardHandler({ ctx, input: { bookingId: 10 } });

    expect(handleNoShowFee).toHaveBeenCalledWith({ booking: mockBooking, payment: mockBooking.payment[0] });
  });

  it("throws BAD_REQUEST when the no-show fee was already charged", async () => {
    mockBookingAccessService.doesUserIdHaveAccessToBooking.mockResolvedValue(true);
    mockBookingRepo.getBookingForPaymentProcessing.mockResolvedValue({
      ...mockBooking,
      payment: [{ ...mockBooking.payment[0], success: true }],
    });

    await expect(chargeCardHandler({ ctx, input: { bookingId: 10 } })).rejects.toBeInstanceOf(TRPCError);
    expect(handleNoShowFee).not.toHaveBeenCalled();
  });
});
