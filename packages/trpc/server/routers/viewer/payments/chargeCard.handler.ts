import { handleNoShowFee } from "@calcom/features/bookings/lib/payment/handleNoShowFee";
import { BookingRepository } from "@calcom/features/bookings/repositories/BookingRepository";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import type { PrismaClient } from "@calcom/prisma";

import { TRPCError } from "@trpc/server";

import type { TrpcSessionUser } from "../../../types";
import type { TChargeCardInputSchema } from "./chargeCard.schema";

interface ChargeCardHandlerOptions {
  ctx: { user: NonNullable<TrpcSessionUser>; prisma: PrismaClient };
  input: TChargeCardInputSchema;
}
export const chargeCardHandler = async ({ ctx, input }: ChargeCardHandlerOptions) => {
  const { prisma } = ctx;

  const bookingRepository = new BookingRepository(prisma);

  const booking = await bookingRepository.getBookingForPaymentProcessing(input.bookingId);

  if (!booking) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Booking not found",
    });
  }

  if (booking.userId !== ctx.user.id) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Only the organizer can charge the card for this booking",
    });
  }

  if (booking.startTime > new Date()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "no_show_fee_charge_before_start",
    });
  }

  if (booking.payment[0].success) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `The no show fee for ${booking.id} has already been charged.`,
    });
  }

  try {
    await handleNoShowFee({
      booking,
      payment: booking.payment[0],
    });
  } catch (error) {
    console.error(error);

    if (error instanceof ErrorWithCode && error.code === ErrorCode.ChargeCardFailure) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: error.message,
      });
    }

    if (error instanceof Error) {
      const message = error.message;

      if (message.includes("User is not a member of the team")) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message,
        });
      }

      if (message.includes("User ID is required") || message.includes("No payment credential found")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message,
        });
      }
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to charge no show fee for ${booking.id}`,
    });
  }
};
