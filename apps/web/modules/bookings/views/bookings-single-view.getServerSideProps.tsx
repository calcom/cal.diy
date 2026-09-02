import { eventTypeMetaDataSchemaWithTypedApps } from "@calcom/app-store/zod-utils";
import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import getBookingInfo from "@calcom/features/bookings/lib/getBookingInfo";
import { BookingRepository } from "@calcom/features/bookings/repositories/BookingRepository";
import { getDefaultEvent } from "@calcom/features/eventtypes/lib/defaultEvents";
import { getBrandingForEventType } from "@calcom/features/profile/lib/getBranding";
import { shouldHideBrandingForEvent } from "@calcom/features/profile/lib/hideBranding";
import { parseRecurringEvent } from "@calcom/lib/isRecurringEvent";
import { markdownToSafeHTML } from "@calcom/lib/markdownToSafeHTML";
import { maybeGetBookingUidFromSeat } from "@calcom/lib/server/maybeGetBookingUidFromSeat";
import prisma from "@calcom/prisma";
import { customInputSchema } from "@calcom/prisma/zod-utils";
import { meRouter } from "@calcom/trpc/server/routers/viewer/me/_router";
import type { inferSSRProps } from "@lib/types/inferSSRProps";
import { createRouterCaller } from "app/_trpc/context";
import type { GetServerSidePropsContext } from "next";
import { z } from "zod";

const stringToBoolean = z
  .string()
  .optional()
  .transform((val) => val === "true");

const querySchema = z.object({
  uid: z.string(),
  email: z.string().optional(),
  eventTypeSlug: z.string().optional(),
  cancel: stringToBoolean,
  allRemainingBookings: stringToBoolean,
  changes: stringToBoolean,
  reschedule: stringToBoolean,
  isSuccessBookingPage: stringToBoolean,
  formerTime: z.string().optional(),
  seatReferenceUid: z.string().optional(),
});

export type PageProps = inferSSRProps<typeof getServerSideProps>;

export async function getServerSideProps(context: GetServerSidePropsContext) {
  // this is needed to prevent bundling of lib/booking to the client bundle
  // usually functions that are used in getServerSideProps are tree shaken from client bundle
  // but not in case when they are exported. So we have to dynamically load them, or to copy paste them to the /future/page.

  const { getRecurringBookings, handleSeatsEventTypeOnBooking, getEventTypesFromDB } = await import(
    "@lib/booking"
  );

  const session = await getServerSession({ req: context.req });
  let tz: string | null = null;
  let userTimeFormat: number | null = null;
  let requiresLoginToUpdate = false;
  if (session) {
    const caller = await createRouterCaller(meRouter);
    const user = await caller.get();
    tz = user.timeZone;
    userTimeFormat = user.timeFormat;
  }

  const parsedQuery = querySchema.safeParse(context.query);

  if (!parsedQuery.success) return { notFound: true } as const;
  const { eventTypeSlug } = parsedQuery.data;
  let { uid, seatReferenceUid } = parsedQuery.data;

  const maybeBookingUidFromSeat = await maybeGetBookingUidFromSeat(prisma, uid);
  if (maybeBookingUidFromSeat.uid) uid = maybeBookingUidFromSeat.uid;
  if (maybeBookingUidFromSeat.seatReferenceUid) seatReferenceUid = maybeBookingUidFromSeat.seatReferenceUid;

  const { bookingInfoRaw, bookingInfo } = await getBookingInfo(uid);

  if (!bookingInfoRaw) {
    return {
      notFound: true,
    } as const;
  }

  let rescheduledToUid: string | null = null;
  if (bookingInfo.rescheduled) {
    const bookingRepo = new BookingRepository(prisma);
    const rescheduledTo = await bookingRepo.findFirstBookingByReschedule({
      originalBookingUid: bookingInfo.uid,
    });
    rescheduledToUid = rescheduledTo?.uid ?? null;
  }

  let previousBooking: {
    rescheduledBy: string | null;
    uid: string;
  } | null = null;

  if (bookingInfo.fromReschedule) {
    const bookingRepo = new BookingRepository(prisma);
    previousBooking = await bookingRepo.findReschedulerByUid({
      uid: bookingInfo.fromReschedule,
    });
  }

  const eventTypeRaw = !bookingInfoRaw.eventTypeId
    ? getDefaultEvent(eventTypeSlug || "")
    : await getEventTypesFromDB(bookingInfoRaw.eventTypeId);
  if (!eventTypeRaw) {
    return {
      notFound: true,
    } as const;
  }

  if (eventTypeRaw.seatsPerTimeSlot && !seatReferenceUid && !session) {
    requiresLoginToUpdate = true;
  }

  // @NOTE: had to do this because Server side cant return [Object objects]
  // probably fixable with json.stringify -> json.parse
  bookingInfo.startTime = (bookingInfo?.startTime as Date)?.toISOString() as unknown as Date;
  bookingInfo.endTime = (bookingInfo?.endTime as Date)?.toISOString() as unknown as Date;

  eventTypeRaw.users = eventTypeRaw.hosts?.length
    ? eventTypeRaw.hosts.map((host) => host.user)
    : eventTypeRaw.users;

  if (!eventTypeRaw.users.length) {
    if (!eventTypeRaw.owner) {
      if (bookingInfoRaw.user) {
        eventTypeRaw.users.push({
          ...bookingInfoRaw.user,
          hideBranding: false,
          theme: null,
          brandColor: null,
          darkBrandColor: null,
          isPlatformManaged: false,
        });
      } else {
        return { notFound: true } as const;
      }
    } else {
      eventTypeRaw.users.push({ ...eventTypeRaw.owner });
    }
  }

  const eventType = {
    ...eventTypeRaw,
    periodStartDate: eventTypeRaw.periodStartDate?.toString() ?? null,
    periodEndDate: eventTypeRaw.periodEndDate?.toString() ?? null,
    metadata: eventTypeMetaDataSchemaWithTypedApps.parse(eventTypeRaw.metadata),
    recurringEvent: parseRecurringEvent(eventTypeRaw.recurringEvent),
    customInputs: customInputSchema.array().parse(eventTypeRaw.customInputs),
    hideOrganizerEmail: eventTypeRaw.hideOrganizerEmail,
    bookingFields: eventTypeRaw.bookingFields.map((field) => {
      return {
        ...field,
        label: field.type === "boolean" ? markdownToSafeHTML(field.label || "") : field.label || "",
        defaultLabel:
          field.type === "boolean" ? markdownToSafeHTML(field.defaultLabel || "") : field.defaultLabel || "",
      };
    }),
  };

  const profile = {
    name: eventType.team?.name || eventType.users[0]?.name || null,
    email: eventType.team ? null : eventType.users[0].email || null,
    ...getBrandingForEventType({ eventType: eventTypeRaw }),
    slug: eventType.team?.slug || eventType.users[0]?.username || null,
  };

  const userId = session?.user?.id;

  const checkIfUserIsHost = (userId?: number | null) => {
    if (!userId) return false;

    return (
      bookingInfo?.user?.id === userId ||
      eventType.users.some(
        (user) =>
          user.id === userId && bookingInfo.attendees.some((attendee) => attendee.email === user.email)
      ) ||
      eventType.hosts.some(
        ({ user }) =>
          user.id === userId && bookingInfo.attendees.some((attendee) => attendee.email === user.email)
      )
    );
  };

  const isLoggedInUserHost = checkIfUserIsHost(userId);
  const eventTeamId = eventType.team?.id ?? eventType.parent?.teamId;
  const isLoggedInUserTeamMember = false;

  const canViewHiddenData = isLoggedInUserHost || isLoggedInUserTeamMember;

  if (bookingInfo !== null && eventType.seatsPerTimeSlot) {
    await handleSeatsEventTypeOnBooking(eventType, bookingInfo, seatReferenceUid, isLoggedInUserHost);
  }

  // For multi-seat bookings, find the payment matching the seat's attendee
  // Each seat creates a separate payment with the attendee's email in metadata
  const seatAttendeeEmail = bookingInfo.attendees?.[0]?.email;
  const payment = await prisma.payment.findFirst({
    where: {
      bookingId: bookingInfo.id,
      ...(seatAttendeeEmail
        ? {
            data: {
              path: ["metadata", "bookerEmail"],
              equals: seatAttendeeEmail,
            },
          }
        : {}),
    },
    select: {
      appId: true,
      success: true,
      refunded: true,
      currency: true,
      amount: true,
      paymentOption: true,
    },
  });

  if (!canViewHiddenData) {
    for (const key in bookingInfo.responses) {
      const field = eventTypeRaw.bookingFields.find((field) => field.name === key);
      if (field && !!field.hidden) {
        delete bookingInfo.responses[key];
      }
    }
  }

  const currentOrgDomain = null;
  const isValidOrgDomain = false;

  async function getInternalNotePresets(teamId: number | null) {
    if (!teamId || !canViewHiddenData) return [];
    return await prisma.internalNotePreset.findMany({
      where: {
        teamId,
      },
      select: {
        id: true,
        name: true,
        cancellationReason: true,
      },
    });
  }

  const internalNotes = await getInternalNotePresets(eventType.team?.id ?? eventType.parent?.teamId ?? null);

  // Filter out organizer information if hideOrganizerEmail is true
  const sanitizedPreviousBooking =
    eventType.hideOrganizerEmail &&
    previousBooking &&
    previousBooking.rescheduledBy === bookingInfo.user?.email
      ? { ...previousBooking, rescheduledBy: bookingInfo.user?.name }
      : previousBooking;

  const isPlatformBooking = eventType.users[0]?.isPlatformManaged || eventType.team?.createdByOAuthClientId;

  return {
    props: {
      orgSlug: currentOrgDomain,
      themeBasis: eventType.team ? eventType.team.slug : eventType.users[0]?.username,
      hideBranding: isPlatformBooking
        ? true
        : await shouldHideBrandingForEvent({
            eventTypeId: eventType.id,
            team: eventType?.parent?.team ?? eventType?.team,
            owner: eventType.users[0] ?? null,
            organizationId: session?.user?.profile?.organizationId ?? session?.user?.org?.id ?? null,
          }),
      profile,
      eventType,
      recurringBookings: await getRecurringBookings(bookingInfo.recurringEventId),
      dynamicEventName: bookingInfo?.eventType?.eventName || "",
      bookingInfo,
      previousBooking: sanitizedPreviousBooking,
      paymentStatus: payment,
      ...(tz && { tz }),
      userTimeFormat,
      requiresLoginToUpdate,
      rescheduledToUid,
      isLoggedInUserHost,
      canViewHiddenData,
      internalNotePresets: internalNotes,
    },
  };
}
