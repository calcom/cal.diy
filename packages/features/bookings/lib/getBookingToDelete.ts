import prisma, { bookingMinimalSelect } from "@calcom/prisma";
import { credentialForCalendarServiceSelect } from "@calcom/prisma/selects/credential";

export async function getBookingToDelete(id: number | undefined, uid: string | undefined) {
  return await prisma.booking.findUniqueOrThrow({
    where: {
      id,
      uid,
    },
    select: {
      ...bookingMinimalSelect,
      recurringEventId: true,
      userId: true,
      user: {
        select: {
          id: true,
          username: true,
          credentials: { select: credentialForCalendarServiceSelect }, // Not leaking at the moment, be careful with
          email: true,
          timeZone: true,
          timeFormat: true,
          name: true,
          destinationCalendar: true,
          locale: true,
          isPlatformManaged: true,
          hideBranding: true,
          profiles: {
            select: {
              organizationId: true,
              organization: { select: { hideBranding: true } },
            },
          },
        },
      },
      location: true,
      references: {
        select: {
          uid: true,
          type: true,
          externalCalendarId: true,
          credentialId: true,
          thirdPartyRecurringEventId: true,
          delegationCredentialId: true,
          meetingUrl: true,
          meetingId: true,
          meetingPassword: true,
        },
      },
      metadata: true,
      payment: true,
      paid: true,
      eventType: {
        select: {
          slug: true,
          owner: {
            select: {
              id: true,
              hideBranding: true,
            },
          },
          teamId: true,
          team: {
            select: {
              id: true,
              name: true,
              parentId: true,
              hideBranding: true,
              parent: { select: { hideBranding: true } },
            },
          },
          parentId: true,
          parent: {
            select: {
              teamId: true,
            },
          },
          userId: true,
          recurringEvent: true,
          title: true,
          eventName: true,
          description: true,
          requiresConfirmation: true,
          price: true,
          currency: true,
          length: true,
          seatsPerTimeSlot: true,
          disableCancelling: true,
          requiresCancellationReason: true,
          bookingFields: true,
          seatsShowAttendees: true,
          metadata: true,
          hideOrganizerEmail: true,
          schedulingType: true,
          customReplyToEmail: true,
          hosts: {
            select: {
              user: true,
            },
          },
        },
      },
      uid: true,
      id: true,
      eventTypeId: true,
      destinationCalendar: true,
      smsReminderNumber: true,
      seatsReferences: true,
      responses: true,
      iCalUID: true,
      iCalSequence: true,
      rootBookingUid: true,
      status: true,
    },
  });
}

export type BookingToDelete = Awaited<ReturnType<typeof getBookingToDelete>>;
