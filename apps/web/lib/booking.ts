import { getBookingFieldsWithSystemFields } from "@calcom/features/bookings/lib/getBookingFields";
import { bookingResponsesDbSchema } from "@calcom/features/bookings/lib/getBookingResponsesSchema";
import prisma from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import { BookingStatus } from "@calcom/prisma/enums";
import { EventTypeMetaDataSchema } from "@calcom/prisma/zod-utils";

export const getEventTypesFromDB = async (id: number) => {
  const userSelect = {
    id: true,
    name: true,
    username: true,
    hideBranding: true,
    theme: true,
    brandColor: true,
    darkBrandColor: true,
    email: true,
    timeZone: true,
    isPlatformManaged: true,
  };
  const eventType = await prisma.eventType.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
      title: true,
      description: true,
      interfaceLanguage: true,
      length: true,
      eventName: true,
      recurringEvent: true,
      requiresConfirmation: true,
      canSendCalVideoTranscriptionEmails: true,
      userId: true,
      successRedirectUrl: true,
      customInputs: true,
      locations: true,
      price: true,
      currency: true,
      bookingFields: true,
      allowReschedulingPastBookings: true,
      hideOrganizerEmail: true,
      disableCancelling: true,
      disableRescheduling: true,
      requiresCancellationReason: true,
      minimumRescheduleNotice: true,
      minimumCancellationNotice: true,
      disableGuests: true,
      timeZone: true,
      profile: {
        select: {
          organizationId: true,
          organization: {
            select: {
              brandColor: true,
              darkBrandColor: true,
              theme: true,
            },
          },
        },
      },
      teamId: true,
      owner: {
        select: userSelect,
      },
      users: {
        select: userSelect,
      },
      hosts: {
        select: {
          user: {
            select: userSelect,
          },
        },
      },
      team: {
        select: {
          id: true,
          slug: true,
          name: true,
          hideBranding: true,
          brandColor: true,
          darkBrandColor: true,
          theme: true,
          parent: {
            select: {
              hideBranding: true,
              brandColor: true,
              darkBrandColor: true,
              theme: true,
            },
          },
          createdByOAuthClientId: true,
        },
      },
      metadata: true,
      seatsPerTimeSlot: true,
      seatsShowAttendees: true,
      seatsShowAvailabilityCount: true,
      schedulingType: true,
      periodStartDate: true,
      periodEndDate: true,
      parent: {
        select: {
          teamId: true,
          team: {
            select: {
              hideBranding: true,
              parent: {
                select: {
                  hideBranding: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!eventType) {
    return eventType;
  }

  const metadata = EventTypeMetaDataSchema.parse(eventType.metadata);
  const isOrgTeamEvent = !!eventType?.team && !!eventType.profile?.organizationId;

  return {
    isDynamic: false,
    ...eventType,
    bookingFields: getBookingFieldsWithSystemFields({ ...eventType, isOrgTeamEvent }),
    metadata,
  };
};

export const handleSeatsEventTypeOnBooking = async (
  eventType: {
    seatsPerTimeSlot?: number | null;
    seatsShowAttendees: boolean | null;
    seatsShowAvailabilityCount: boolean | null;
    [x: string | number | symbol]: unknown;
  },
  bookingInfo: Partial<
    Prisma.BookingGetPayload<{
      include: {
        attendees: { select: { name: true; email: true; phoneNumber: true } };
        seatsReferences: { select: { referenceUid: true } };
        user: {
          select: {
            id: true;
            name: true;
            email: true;
            username: true;
            timeZone: true;
          };
        };
      };
    }>
  >,
  seatReferenceUid?: string,
  isHost?: boolean
) => {
  bookingInfo.responses = {};
  type seatAttendee = {
    attendee: {
      email: string;
      name: string;
      phoneNumber: string | null;
    };
    id: number;
    data: Prisma.JsonValue;
    bookingId: number;
    attendeeId: number;
    referenceUid: string;
  } | null;
  let seatAttendee: seatAttendee = null;
  if (seatReferenceUid) {
    seatAttendee = await prisma.bookingSeat.findUnique({
      where: {
        referenceUid: seatReferenceUid,
      },
      include: {
        attendee: {
          select: {
            name: true,
            email: true,
            phoneNumber: true,
          },
        },
      },
    });
  }
  if (seatAttendee) {
    const seatAttendeeData = seatAttendee.data as unknown as {
      description?: string;
      responses: Prisma.JsonValue;
    };
    bookingInfo.description = seatAttendeeData.description ?? null;
    bookingInfo.responses = bookingResponsesDbSchema.parse(seatAttendeeData.responses ?? {});
  }

  if (!eventType.seatsShowAttendees && !isHost) {
    if (seatAttendee) {
      const attendee = bookingInfo?.attendees?.find((a) => {
        return (
          a.email === seatAttendee?.attendee?.email ||
          (a.phoneNumber && a.phoneNumber === seatAttendee?.attendee?.phoneNumber)
        );
      });
      bookingInfo.attendees = attendee ? [attendee] : [];
    } else {
      bookingInfo.attendees = [];
    }
  }

  // // @TODO: If handling teams, we need to do more check ups for this.
  // if (bookingInfo?.user?.id === userId) {
  //   return;
  // }
  return bookingInfo;
};

export async function getRecurringBookings(recurringEventId: string | null) {
  if (!recurringEventId) return null;
  const recurringBookings = await prisma.booking.findMany({
    where: {
      recurringEventId,
      status: {
        in: [BookingStatus.ACCEPTED, BookingStatus.PENDING],
      },
    },
    select: {
      startTime: true,
    },
  });
  return recurringBookings.map((obj) => obj.startTime.toString());
}
