import { bookingSeatMetadataSchema } from "@calcom/prisma/zod-utils";

/**
 * Resolves the uid of the payment that belongs to a specific seat from its metadata.
 *
 * In a multi-seat paid booking every seat shares the same parent booking, so a payment lookup
 * scoped only by bookingId returns the first seat's payment for every seat. The per-seat payment
 * uid is persisted on the seat's metadata at creation time; this reads it back so the confirmation
 * page can show each seat its own price. Returns undefined for seats created before the reference
 * was persisted, letting callers fall back to the booking-level lookup.
 */
export function getSeatPaymentUid(seatMetadata: unknown): string | undefined {
  if (!seatMetadata) return undefined;
  return bookingSeatMetadataSchema.safeParse(seatMetadata).data?.paymentUid;
}
