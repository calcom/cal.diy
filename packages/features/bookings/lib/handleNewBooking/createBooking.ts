import dayjs from "@calcom/dayjs";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { HttpError } from "@calcom/lib/http-error";
import { isPrismaObjOrUndefined } from "@calcom/lib/isPrismaObj";
import { withReporting } from "@calcom/lib/sentryWrapper";
import prisma from "@calcom/prisma";
import { Prisma } from "@calcom/prisma/client";
import type { CreationSource } from "@calcom/prisma/enums";
import { BookingStatus } from "@calcom/prisma/enums";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type short from "short-uuid";
import { v5 as uuidv5 } from "uuid";
import type { TgetBookingDataSchema } from "../getBookingDataSchema";
import type { AwaitedBookingData, EventTypeId } from "./getBookingData";
import type { NewBookingEventType } from "./getEventTypesFromDB";
import { withHostLock } from "./hostLock";
import type { LoadedUsers } from "./loadUsers";
import type { OriginalRescheduledBooking } from "./originalRescheduledBookingUtils";
import type { PaymentAppData, Tracking } from "./types";

type ReqBodyWithEnd = TgetBookingDataSchema & { end: string };

type CreateBookingParams = {
  uid: short.SUUID;
  rescheduledBy: string | undefined;
  reqBody: {
    user: ReqBodyWithEnd["user"];
    metadata: ReqBodyWithEnd["metadata"];
    recurringEventId: ReqBodyWithEnd["recurringEventId"];
  };
  eventType: {
    eventTypeData: NewBookingEventType;
    id: EventTypeId;
    slug: AwaitedBookingData["eventTypeSlug"];
    organizerUser: LoadedUsers[number] & {
      isFixed?: boolean;
      metadata?: Prisma.JsonValue;
    };
    isConfirmedByDefault: boolean;
    paymentAppData: PaymentAppData;
  };
  input: {
    bookerEmail: AwaitedBookingData["email"];
    rescheduleReason: AwaitedBookingData["rescheduleReason"];
    smsReminderNumber: AwaitedBookingData["smsReminderNumber"];
    responses: ReqBodyWithEnd["responses"] | null;
  };
  evt: CalendarEvent;
  originalRescheduledBooking: OriginalRescheduledBooking;
  creationSource?: CreationSource;
  tracking?: Tracking;
};

function updateEventDetails(
  evt: CalendarEvent,
  originalRescheduledBooking: OriginalRescheduledBooking | null
) {
  if (originalRescheduledBooking) {
    evt.description = originalRescheduledBooking?.description || evt.description;
    evt.location = evt.location || originalRescheduledBooking?.location;
  }
}

// Define the function with underscore prefix
const _createBooking = async ({
  uid,
  reqBody,
  eventType,
  input,
  evt,
  originalRescheduledBooking,
  rescheduledBy,
  creationSource,
  tracking,
}: CreateBookingParams & { rescheduledBy: string | undefined }) => {
  updateEventDetails(evt, originalRescheduledBooking);

  const bookingAndAssociatedData = buildNewBookingData({
    uid,
    rescheduledBy,
    reqBody,
    eventType,
    input,
    evt,
    originalRescheduledBooking,
    creationSource,
    tracking,
  });

  return await saveBooking(
    bookingAndAssociatedData,
    originalRescheduledBooking,
    eventType.paymentAppData,
    eventType.organizerUser,
    eventType.eventTypeData
  );
};

async function saveBooking(
  bookingAndAssociatedData: ReturnType<typeof buildNewBookingData>,
  originalRescheduledBooking: OriginalRescheduledBooking,
  paymentAppData: PaymentAppData,
  organizerUser: CreateBookingParams["eventType"]["organizerUser"],
  eventTypeData?: CreateBookingParams["eventType"]["eventTypeData"]
) {
  return withHostLock(organizerUser?.id, async () => {
    const { newBookingData, originalBookingUpdateDataForCancellation } = bookingAndAssociatedData;
    const createBookingObj = {
      include: {
        user: {
          select: {
            uuid: true,
            email: true,
            name: true,
            timeZone: true,
            username: true,
            isPlatformManaged: true,
          },
        },
        attendees: true,
        payment: true,
        references: true,
      },
      data: newBookingData,
    };

    if (originalRescheduledBooking?.paid && originalRescheduledBooking?.payment) {
      const bookingPayment = originalRescheduledBooking.payment.find((payment) => payment.success);
      if (bookingPayment) {
        createBookingObj.data.payment = { connect: { id: bookingPayment.id } };
      }
    }

    if (typeof paymentAppData.price === "number" && paymentAppData.price > 0) {
      await prisma.credential.findFirstOrThrow({
        where: {
          appId: paymentAppData.appId,
          ...(paymentAppData.credentialId
            ? { id: paymentAppData.credentialId }
            : { userId: organizerUser.id }),
        },
        select: { id: true },
      });
    }

    return prisma.$transaction(async (tx) => {
      if (originalBookingUpdateDataForCancellation) {
        await tx.booking.update(originalBookingUpdateDataForCancellation);
      }

      if (organizerUser?.id && tx.$executeRaw) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking_host_${organizerUser.id}`}))`;
      }

      if (newBookingData.startTime && newBookingData.endTime && organizerUser?.id) {
        const newBefore = eventTypeData?.beforeEventBuffer || 0;
        const newAfter = eventTypeData?.afterEventBuffer || 0;

        let maxBufferMinutes = 1440;
        try {
          const maxHostBuffer = await tx.eventType.aggregate({
            where: { userId: organizerUser.id },
            _max: {
              beforeEventBuffer: true,
              afterEventBuffer: true,
            },
          });
          maxBufferMinutes = Math.max(
            1440,
            maxHostBuffer._max?.beforeEventBuffer || 0,
            maxHostBuffer._max?.afterEventBuffer || 0,
            newBefore,
            newAfter
          );
        } catch {
          maxBufferMinutes = Math.max(1440, newBefore, newAfter);
        }

        const candidateBookings = await tx.booking.findMany({
          where: {
            userId: organizerUser.id,
            status: { in: [BookingStatus.ACCEPTED, BookingStatus.PENDING] },
            startTime: {
              lt: dayjs(newBookingData.endTime)
                .add(newAfter + maxBufferMinutes, "minute")
                .toDate(),
            },
            endTime: {
              gt: dayjs(newBookingData.startTime)
                .subtract(newBefore + maxBufferMinutes, "minute")
                .toDate(),
            },
            ...(originalRescheduledBooking?.id ? { id: { not: originalRescheduledBooking.id } } : {}),
          },
          select: {
            id: true,
            startTime: true,
            endTime: true,
            eventType: {
              select: {
                beforeEventBuffer: true,
                afterEventBuffer: true,
              },
            },
          },
        });

        const newStartMs = dayjs(newBookingData.startTime).valueOf();
        const newEndMs = dayjs(newBookingData.endTime).valueOf();

        const conflictingBooking = candidateBookings.find((existing) => {
          const existingBefore = existing.eventType?.beforeEventBuffer || 0;
          const existingAfter = existing.eventType?.afterEventBuffer || 0;

          const blockedStart = dayjs(existing.startTime)
            .subtract(newAfter + existingBefore, "minute")
            .valueOf();
          const blockedEnd = dayjs(existing.endTime)
            .add(newBefore + existingAfter, "minute")
            .valueOf();

          return newStartMs < blockedEnd && newEndMs > blockedStart;
        });

        if (conflictingBooking) {
          throw new HttpError({
            statusCode: 409,
            message: ErrorCode.BookingConflict,
          });
        }
      }

      const booking = await tx.booking.create(createBookingObj);

      return { ...booking, userUuid: booking.user?.uuid ?? null };
    });
  });
}

function getEventTypeRel(eventTypeId: EventTypeId) {
  return eventTypeId ? { connect: { id: eventTypeId } } : {};
}

function getAttendeesData(evt: Pick<CalendarEvent, "attendees" | "team">) {
  //if attendee is team member, it should fetch their locale not booker's locale
  //perhaps make email fetch request to see if his locale is stored, else
  const teamMembers = evt?.team?.members ?? [];

  return evt.attendees.concat(teamMembers).map((attendee) => ({
    name: attendee.name,
    email: attendee.email,
    timeZone: attendee.timeZone,
    locale: attendee.language.locale,
    phoneNumber: attendee.phoneNumber,
  }));
}

function buildNewBookingData(params: CreateBookingParams) {
  const {
    uid,
    evt,
    reqBody,
    eventType,
    input,
    originalRescheduledBooking,
    rescheduledBy,
    creationSource,
    tracking,
  } = params;

  const attendeesData = getAttendeesData(evt);
  const eventTypeRel = getEventTypeRel(eventType.id);
  let idempotencyKey: string | null = null;
  if (!evt.seatsPerTimeSlot && eventType.organizerUser?.id) {
    const startMs = dayjs.utc(evt.startTime).valueOf();
    const endMs = dayjs.utc(evt.endTime).valueOf();
    idempotencyKey = uuidv5(`${startMs}.${endMs}.${eventType.organizerUser.id}`, uuidv5.URL);
  }

  const newBookingData: Prisma.BookingCreateInput = {
    uid,
    userPrimaryEmail: evt.organizer.email,
    responses: input.responses === null || evt.seatsPerTimeSlot ? Prisma.JsonNull : input.responses,
    title: evt.title,
    startTime: dayjs.utc(evt.startTime).toDate(),
    endTime: dayjs.utc(evt.endTime).toDate(),
    description: evt.seatsPerTimeSlot ? null : evt.additionalNotes,
    customInputs: isPrismaObjOrUndefined(evt.customInputs),
    status: eventType.isConfirmedByDefault ? BookingStatus.ACCEPTED : BookingStatus.PENDING,
    idempotencyKey,
    oneTimePassword: evt.oneTimePassword,
    location: evt.location,
    eventType: eventTypeRel,
    smsReminderNumber: input.smsReminderNumber,
    metadata: reqBody.metadata,
    attendees: {
      createMany: {
        data: attendeesData,
      },
    },
    dynamicEventSlugRef: !eventType.id ? eventType.slug : null,
    dynamicGroupSlugRef: !eventType.id ? (reqBody.user as string).toLowerCase() : null,
    iCalUID: evt.iCalUID ?? "",
    iCalSequence: originalRescheduledBooking ? evt.iCalSequence || 1 : 0,
    user: {
      connect: {
        id: eventType.organizerUser.id,
      },
    },
    destinationCalendar:
      evt.destinationCalendar && evt.destinationCalendar.length > 0
        ? {
            connect: { id: evt.destinationCalendar[0].id },
          }
        : undefined,
    creationSource,
    tracking: tracking ? { create: tracking } : undefined,
  };

  if (reqBody.recurringEventId) {
    newBookingData.recurringEventId = reqBody.recurringEventId;
  }

  let originalBookingUpdateDataForCancellation: Prisma.BookingUpdateArgs | undefined;

  if (originalRescheduledBooking) {
    newBookingData.metadata = {
      ...(typeof originalRescheduledBooking.metadata === "object" && originalRescheduledBooking.metadata),
      ...reqBody.metadata,
    };
    newBookingData.paid = originalRescheduledBooking.paid;
    newBookingData.fromReschedule = originalRescheduledBooking.uid;
    if (originalRescheduledBooking.uid) {
      newBookingData.cancellationReason = input.rescheduleReason;
    }
    // Reschedule logic with booking with seats
    if (
      newBookingData.attendees?.createMany?.data &&
      eventType?.eventTypeData?.seatsPerTimeSlot &&
      input.bookerEmail
    ) {
      newBookingData.attendees.createMany.data = attendeesData.filter(
        (attendee) => attendee.email === input.bookerEmail
      );
    }

    if (originalRescheduledBooking.recurringEventId) {
      newBookingData.recurringEventId = originalRescheduledBooking.recurringEventId;
    }

    if (!evt.seatsPerTimeSlot && originalRescheduledBooking?.uid) {
      originalBookingUpdateDataForCancellation = {
        where: {
          id: originalRescheduledBooking.id,
        },
        data: {
          rescheduled: true,
          status: BookingStatus.CANCELLED,
          rescheduledBy: rescheduledBy,
        },
      };
    }
  }

  return {
    newBookingData,
    originalBookingUpdateDataForCancellation,
  };
}

export const createBooking = withReporting(_createBooking, "createBooking");

export type Booking = Awaited<ReturnType<typeof createBooking>>;
