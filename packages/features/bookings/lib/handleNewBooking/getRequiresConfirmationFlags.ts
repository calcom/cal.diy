import dayjs from "@calcom/dayjs";
import { checkIfFreeEmailDomain } from "@calcom/features/watchlist/lib/freeEmailDomainCheck/checkIfFreeEmailDomain";
import { withReporting } from "@calcom/lib/sentryWrapper";
import { BookingStatus } from "@calcom/prisma/enums";
import type { OriginalRescheduledBooking } from "./originalRescheduledBookingUtils";

import type { getEventTypeResponse } from "./getEventTypesFromDB";

type EventType = Pick<
  getEventTypeResponse,
  "metadata" | "requiresConfirmation" | "requiresConfirmationForFreeEmail"
>;
type PaymentAppData = { price: number };

export async function getRequiresConfirmationFlags({
  eventType,
  bookingStartTime,
  userId,
  paymentAppData,
  originalRescheduledBooking,
  bookerEmail,
}: {
  eventType: EventType;
  bookingStartTime: string;
  userId: number | undefined;
  paymentAppData: PaymentAppData;
  originalRescheduledBooking: OriginalRescheduledBooking | null,
  bookerEmail: string;
}) {
  const requiresConfirmation = await determineRequiresConfirmation(eventType, bookingStartTime, bookerEmail);
  const originalRescheduledBookingOrganizerId = originalRescheduledBooking?.user?.id
  const userReschedulingIsOwner = isUserReschedulingOwner(userId, originalRescheduledBookingOrganizerId);
  const originalWasPending = originalRescheduledBooking?.status === BookingStatus.PENDING

  const isConfirmedByDefault = determineIsConfirmedByDefault(
    requiresConfirmation,
    paymentAppData.price,
    userReschedulingIsOwner,
    originalWasPending
  );

  return {
    /**
     * Organizer of the booking is rescheduling
     */
    userReschedulingIsOwner,
    /**
     * Booking won't need confirmation to be ACCEPTED
     */
    isConfirmedByDefault,
  };
}

// Define the function with underscore prefix
const _determineRequiresConfirmation = async (
  eventType: EventType,
  bookingStartTime: string,
  bookerEmail: string
): Promise<boolean> => {
  let requiresConfirmation = eventType?.requiresConfirmation;
  const rcThreshold = eventType?.metadata?.requiresConfirmationThreshold;
  const requiresConfirmationForFreeEmail = eventType?.requiresConfirmationForFreeEmail;

  if (requiresConfirmationForFreeEmail) {
    requiresConfirmation = await checkIfFreeEmailDomain({ email: bookerEmail });
  }

  if (rcThreshold) {
    const timeDifference = dayjs(dayjs(bookingStartTime).utc().format()).diff(dayjs(), rcThreshold.unit);
    if (timeDifference > rcThreshold.time) {
      requiresConfirmation = false;
    }
  }

  return requiresConfirmation;
};

export const determineRequiresConfirmation = withReporting(
  _determineRequiresConfirmation,
  "determineRequiresConfirmation"
);

function isUserReschedulingOwner(
  userId: number | undefined,
  originalRescheduledBookingOrganizerId: number | undefined
): boolean {
  // If the user is not the owner of the event, new booking should be always pending.
  // Otherwise, an owner rescheduling should be always accepted.
  // Before comparing make sure that userId is set, otherwise undefined === undefined
  return !!(userId && originalRescheduledBookingOrganizerId === userId);
}

function determineIsConfirmedByDefault(
  requiresConfirmation: boolean,
  price: number,
  userReschedulingIsOwner: boolean,
  originalWasPending: boolean,
): boolean {
  return (!requiresConfirmation && price === 0) || userReschedulingIsOwner && !originalWasPending;
}
