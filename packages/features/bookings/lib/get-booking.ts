import { bookingResponsesDbSchema } from "@calcom/features/bookings/lib/getBookingResponsesSchema";
import slugify from "@calcom/lib/slugify";
import type { PrismaClient } from "@calcom/prisma";
import prisma from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import { MembershipRole } from "@calcom/prisma/enums";

type BookingSelect = {
  description: true;
  customInputs: true;
  attendees: {
    select: {
      email: true;
      name: true;
    };
  };
  location: true;
};

// Backward Compatibility for booking created before we had managed booking questions
function getResponsesFromOldBooking(
  rawBooking: Prisma.BookingGetPayload<{
    select: BookingSelect;
  }>
) {
  const customInputs = rawBooking.customInputs || {};
  const responses = Object.keys(customInputs).reduce((acc, label) => {
    acc[slugify(label) as keyof typeof acc] = customInputs[label as keyof typeof customInputs];
    return acc;
  }, {});
  return {
    // It is possible to have no attendees in a booking when the booking is cancelled.
    name: rawBooking.attendees[0]?.name || "Nameless",
    email: rawBooking.attendees[0]?.email || "",
    guests: rawBooking.attendees.slice(1).map((attendee) => {
      return attendee.email;
    }),
    notes: rawBooking.description || "",
    location: {
      value: rawBooking.location || "",
      optionValue: rawBooking.location || "",
    },
    ...responses,
  };
}

async function getBooking(prisma: PrismaClient, uid: string, isSeatedEvent?: boolean) {
  const rawBooking = await prisma.booking.findUnique({
    where: {
      uid,
    },
    select: {
      id: true,
      uid: true,
      startTime: true,
      endTime: true,
      description: true,
      customInputs: true,
      responses: true,
      smsReminderNumber: true,
      location: true,
      eventTypeId: true,
      status: true,
      userId: true,
      eventType: {
        select: {
          disableRescheduling: true,
          minimumRescheduleNotice: true,
        },
      },
      attendees: {
        select: {
          email: true,
          name: true,
          bookingSeat: true,
        },
        orderBy: {
          id: "asc",
        },
      },
      user: {
        select: {
          id: true,
          username: true,
        },
      },
    },
  });

  if (!rawBooking) {
    return rawBooking;
  }

  const booking = getBookingWithResponses(rawBooking, isSeatedEvent);

  if (booking) {
    // @NOTE: had to do this because Server side cant return [Object objects]
    // probably fixable with json.stringify -> json.parse
    booking.startTime = (booking?.startTime as Date)?.toISOString() as unknown as Date;
    booking.endTime = (booking?.endTime as Date)?.toISOString() as unknown as Date;
  }

  return booking;
}

export type GetBookingType = Awaited<ReturnType<typeof getBooking>>;

export const getBookingWithResponses = <
  T extends Prisma.BookingGetPayload<{
    select: BookingSelect & {
      responses: true;
    };
  }>,
>(
  booking: T,
  isSeatedEvent?: boolean
) => {
  return {
    ...booking,
    responses: isSeatedEvent ? booking.responses : booking.responses || getResponsesFromOldBooking(booking),
  } as Omit<T, "responses"> & { responses: Record<string, any> };
};

export default getBooking;

/**
 * Checks whether a uid belongs to an existing booking or to a booking seat reference.
 * Lets callers differentiate an unknown rescheduleUid (which should lead to a 404)
 * from a booking that exists but can't be rescheduled by the current visitor
 * (e.g. a seated event where only the organizer or a host can reschedule).
 */
export const doesBookingOrSeatUidExist = async (uid: string): Promise<boolean> => {
  const [booking, bookingSeat] = await Promise.all([
    prisma.booking.findUnique({ where: { uid }, select: { id: true } }),
    prisma.bookingSeat.findFirst({ where: { referenceUid: uid }, select: { id: true } }),
  ]);
  return !!booking || !!bookingSeat;
};

export const getBookingForReschedule = async (uid: string, userId?: number) => {
  let rescheduleUid: string | null = null;
  const theBooking = await prisma.booking.findUnique({
    where: {
      uid,
    },
    select: {
      id: true,
      userId: true,
      user: {
        select: {
          organizationId: true,
        },
      },
      eventType: {
        select: {
          seatsPerTimeSlot: true,
          teamId: true,
          hosts: {
            select: {
              userId: true,
            },
          },
          owner: {
            select: {
              id: true,
            },
          },
        },
      },
    },
  });
  let bookingSeatReferenceUid: number | null = null;

  // If no booking is found via the uid, it's probably a booking seat
  // that its being rescheduled, which we query next.
  let attendeeEmail: string | null = null;
  let bookingSeatData: {
    description?: string;
    responses: Prisma.JsonValue;
  } | null = null;
  if (!theBooking) {
    const bookingSeat = await prisma.bookingSeat.findFirst({
      where: {
        referenceUid: uid,
      },
      select: {
        id: true,
        attendee: {
          select: {
            name: true,
            email: true,
          },
        },
        data: true,
        booking: {
          select: {
            uid: true,
          },
        },
      },
    });
    if (bookingSeat) {
      bookingSeatData = bookingSeat.data as unknown as {
        description?: string;
        responses: Prisma.JsonValue;
      };
      bookingSeatReferenceUid = bookingSeat.id;
      rescheduleUid = bookingSeat.booking.uid;
      attendeeEmail = bookingSeat.attendee.email;
    }
  }

  // If we have the booking and not bookingSeat, we need to make sure the booking belongs to the userLoggedIn
  // Otherwise, we return null here.
  let hasOwnershipOnBooking = false;
  if (theBooking?.eventType?.seatsPerTimeSlot && bookingSeatReferenceUid === null) {
    const isOwnerOfBooking = theBooking.userId === userId;

    const isHostOfEventType = theBooking?.eventType?.hosts.some((host) => host.userId === userId);

    const isUserIdInBooking = theBooking.userId === userId;

    if (!isOwnerOfBooking && !isHostOfEventType && !isUserIdInBooking) return null;
    hasOwnershipOnBooking = true;
  }

  // If we don't have a booking and no rescheduleUid, the ID is invalid,
  // and we return null here.
  if (!theBooking && !rescheduleUid) return null;

  const booking = await getBooking(prisma, rescheduleUid || uid, !!bookingSeatReferenceUid);

  if (!booking) return null;

  if (bookingSeatReferenceUid) {
    booking.description = bookingSeatData?.description ?? null;
    booking.responses = bookingResponsesDbSchema.parse(bookingSeatData?.responses ?? {});
  }
  return {
    ...booking,
    attendees: rescheduleUid
      ? booking.attendees.filter((attendee) => attendee.email === attendeeEmail)
      : hasOwnershipOnBooking
        ? []
        : booking.attendees,
  };
};

/**
 * Should only get booking attendees length for seated events
 * @param uid
 * @returns booking with masked attendee emails
 */
export const getBookingForSeatedEvent = async (uid: string) => {
  const booking = await prisma.booking.findUnique({
    where: {
      uid,
    },
    select: {
      id: true,
      uid: true,
      startTime: true,
      endTime: true,
      status: true,
      userId: true,
      attendees: {
        select: {
          id: true,
        },
      },
      eventTypeId: true,
      user: {
        select: {
          id: true,
          username: true,
        },
      },
    },
  });

  if (!booking || booking.eventTypeId === null) return null;

  // Validate booking event type has seats enabled
  const eventType = await prisma.eventType.findUnique({
    where: {
      id: booking.eventTypeId,
    },
    select: {
      seatsPerTimeSlot: true,
    },
  });
  if (!eventType || eventType.seatsPerTimeSlot === null) return null;

  const result: GetBookingType = {
    ...booking,
    // @NOTE: had to do this because Server side cant return [Object objects]
    startTime: booking.startTime.toISOString() as unknown as Date,
    endTime: booking.endTime.toISOString() as unknown as Date,
    description: null,
    customInputs: null,
    responses: {},
    smsReminderNumber: null,
    location: null,
    eventType: {
      disableRescheduling: false,
      minimumRescheduleNotice: null,
    },
    // mask attendee emails for seated events
    attendees: booking.attendees.map((attendee) => ({
      ...attendee,
      email: "",
      name: "",
      bookingSeat: null,
    })),
  };
  return result;
};

export const getMultipleDurationValue = (
  multipleDurationConfig: number[] | undefined,
  queryDuration: string | string[] | undefined,
  defaultValue: number
) => {
  if (!multipleDurationConfig) return null;
  if (multipleDurationConfig.includes(Number(queryDuration))) return Number(queryDuration);
  return defaultValue;
};
