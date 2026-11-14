import { getCalendar } from "@calcom/app-store/_utils/getCalendar";
import { getAllDelegationCredentialsForUserIncludeServiceAccountKey } from "@calcom/app-store/delegationCredential";
import { getDelegationCredentialOrFindRegularCredential } from "@calcom/app-store/delegationCredential";
import { deleteMeeting } from "@calcom/features/conferencing/lib/videoClient";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import prisma from "@calcom/prisma";
import type { Attendee } from "@calcom/prisma/client";
import { BookingStatus } from "@calcom/prisma/enums";
import type { CalendarEvent } from "@calcom/types/Calendar";

import type { OriginalRescheduledBooking } from "../../handleNewBooking/originalRescheduledBookingUtils";

const log: typeof logger = logger.getSubLogger({ prefix: ["lastAttendeeDeleteBooking"] });

/* Check if the original booking has no more attendees, if so delete the booking
  and any calendar or video integrations */
const lastAttendeeDeleteBooking = async (
  originalRescheduledBooking: OriginalRescheduledBooking,
  filteredAttendees: Partial<Attendee>[] | undefined,
  originalBookingEvt?: CalendarEvent
) => {
  let deletedReferences = false;
  const bookingUser = originalRescheduledBooking?.user;
  const delegationCredentials = bookingUser
    ? // We fetch delegation credentials with ServiceAccount key as CalendarService instance created later in the flow needs it
      await getAllDelegationCredentialsForUserIncludeServiceAccountKey({
        user: { email: bookingUser.email, id: bookingUser.id },
      })
    : [];
  if ((!filteredAttendees || filteredAttendees.length === 0) && originalRescheduledBooking) {
    const integrationsToDelete = [];

    for (const reference of originalRescheduledBooking.references) {
      if (reference.credentialId || reference.delegationCredentialId) {
        const credential = await getDelegationCredentialOrFindRegularCredential({
          id: {
            credentialId: reference.credentialId,
            delegationCredentialId: reference.delegationCredentialId,
          },
          delegationCredentials,
        });

        if (credential) {
          if (reference.type.includes("_video")) {
            integrationsToDelete.push(deleteMeeting(credential, reference.uid));
          }
          if (reference.type.includes("_calendar") && originalBookingEvt) {
            const calendar = await getCalendar(credential, "booking");
            if (calendar) {
              integrationsToDelete.push(
                calendar?.deleteEvent(reference.uid, originalBookingEvt, reference.externalCalendarId)
              );
            }
          }
        }
      }
    }

    // Cleanup of the old booking must not block the attendee's reschedule, so a failed
    // delete is only logged, the same way EventManager.deleteEventsAndMeetings handles it.
    const results = await Promise.allSettled(integrationsToDelete);
    for (const result of results) {
      if (result.status === "rejected") {
        log.warn(
          `Error deleting calendar event or video meeting for booking ${originalRescheduledBooking.id}`,
          safeStringify({ error: result.reason })
        );
      }
    }

    await prisma.booking.update({
      where: {
        id: originalRescheduledBooking.id,
      },
      data: {
        status: BookingStatus.CANCELLED,
      },
    });
    deletedReferences = true;
  }
  return deletedReferences;
};

export default lastAttendeeDeleteBooking;
