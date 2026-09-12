import { getUsersCredentialsIncludeServiceAccountKey } from "@calcom/app-store/delegationCredential";
import type { LocationObject } from "@calcom/app-store/locations";
import { getLocationValueForDB } from "@calcom/app-store/locations";
import { sendDeclinedEmailsAndSMS } from "@calcom/emails/email-manager";
import { getAllCredentialsIncludeServiceAccountKey } from "@calcom/features/bookings/lib/getAllCredentialsForUsersOnEvent/getAllCredentials";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { getAssignmentReasonCategory } from "@calcom/features/bookings/lib/getAssignmentReasonCategory";
import { getCalEventResponses } from "@calcom/features/bookings/lib/getCalEventResponses";
import { handleConfirmation } from "@calcom/features/bookings/lib/handleConfirmation";
import { handleWebhookTrigger } from "@calcom/features/bookings/lib/handleWebhookTrigger";
import { processPaymentRefund } from "@calcom/features/bookings/lib/payment/processPaymentRefund";
import { BookingAccessService } from "@calcom/features/bookings/services/BookingAccessService";
import {
  type EventTypeBrandingData,
  getEventTypeService,
} from "@calcom/features/eventtypes/di/EventTypeService.container";
import type { GetSubscriberOptions } from "@calcom/features/webhooks/lib/getWebhooks";
import type { EventPayloadType, EventTypeInfo } from "@calcom/features/webhooks/lib/sendPayload";
import getOrgIdFromMemberOrTeamId from "@calcom/lib/getOrgIdFromMemberOrTeamId";
import { getTeamIdFromEventType } from "@calcom/lib/getTeamIdFromEventType";
import { isPrismaObjOrUndefined } from "@calcom/lib/isPrismaObj";
import { parseRecurringEvent } from "@calcom/lib/isRecurringEvent";
import { getTranslation } from "@calcom/i18n/server";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import { getTimeFormatStringFromUserTimeFormat } from "@calcom/lib/timeFormat";
import type { TraceContext } from "@calcom/lib/tracing";
import { prisma } from "@calcom/prisma";
import { Prisma } from "@calcom/prisma/client";
import { BookingStatus, WebhookTriggerEvents } from "@calcom/prisma/enums";
import type { EventTypeMetadata } from "@calcom/prisma/zod-utils";
import type { CalendarEvent } from "@calcom/types/Calendar";
import { TRPCError } from "@trpc/server";
import type { TrpcSessionUser } from "../../../types";
import type { TConfirmInputSchema } from "./confirm.schema";

type ConfirmOptions = {
  ctx: {
    user: Pick<
      NonNullable<TrpcSessionUser>,
      "id" | "uuid" | "email" | "username" | "role" | "destinationCalendar"
    >;
    traceContext: TraceContext;
  };
  input: TConfirmInputSchema;
};

/**
 * TODO: Convert it to a service as this fn is the single point of entry across trpc, magic-links, and API v2
 */
export const confirmHandler = async ({ ctx, input }: ConfirmOptions) => {
  const log = logger.getSubLogger({ prefix: ["confirmHandler"] });
  const {
    bookingId,
    recurringEventId,
    reason: rejectionReason,
    confirmed,
    emailsEnabled,
    platformClientParams,
  } = input;

  const booking = await prisma.booking.findUniqueOrThrow({
    where: {
      id: bookingId,
    },
    select: {
      title: true,
      description: true,
      customInputs: true,
      startTime: true,
      endTime: true,
      attendees: true,
      eventTypeId: true,
      responses: true,
      metadata: true,
      userPrimaryEmail: true,
      eventType: {
        select: {
          id: true,
          owner: true,
          teamId: true,
          recurringEvent: true,
          title: true,
          slug: true,
          requiresConfirmation: true,
          currency: true,
          length: true,
          description: true,
          price: true,
          bookingFields: true,
          hideOrganizerEmail: true,
          hideCalendarNotes: true,
          hideCalendarEventDetails: true,
          disableGuests: true,
          disableCancelling: true,
          disableRescheduling: true,
          customReplyToEmail: true,
          seatsPerTimeSlot: true,
          seatsShowAttendees: true,
          metadata: true,
          locations: true,
          team: {
            select: {
              id: true,
              name: true,
              parentId: true,
              hideBranding: true,
              parent: { select: { hideBranding: true } },
            },
          },
          customInputs: true,
          parentId: true,
          parent: {
            select: {
              teamId: true,
            },
          },
        },
      },
      location: true,
      userId: true,
      user: {
        select: {
          id: true,
          username: true,
          email: true,
          timeZone: true,
          timeFormat: true,
          name: true,
          destinationCalendar: true,
          locale: true,
          hideBranding: true,
          profiles: {
            select: {
              organization: { select: { hideBranding: true } },
            },
          },
        },
      },
      id: true,
      uid: true,
      payment: true,
      destinationCalendar: true,
      paid: true,
      recurringEventId: true,
      status: true,
      smsReminderNumber: true,
      assignmentReason: {
        select: {
          reasonEnum: true,
          reasonString: true,
        },
        orderBy: {
          createdAt: "desc" as const,
        },
        take: 1,
      },
    },
  });

  const user = booking.user;
  if (!user) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Booking must have an organizer" });
  }

  const bookingAccessService = new BookingAccessService(prisma);
  const isUserAuthorizedToConfirmBooking = await bookingAccessService.doesUserIdHaveAccessToBooking({
    userId: ctx.user.id,
    bookingId: bookingId,
  });

  if (!isUserAuthorizedToConfirmBooking) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "User is not authorized to confirm this booking",
    });
  }

  // Do not move this before authorization check.
  // This is done to avoid exposing extra information to the requester.
  if (booking.status === BookingStatus.ACCEPTED) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Booking already confirmed" });
  }

  if (confirmed && booking.status !== BookingStatus.PENDING) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only pending bookings can be confirmed",
    });
  }

  // Atomically claim the booking and guard against double-booking.
  // A per-user advisory lock serializes concurrent confirmations so the overlap check
  // and the compare-and-swap status write cannot interleave: a second request waits
  // until the first transaction commits before reading, and will then see the ACCEPTED row.
  if (confirmed && booking.status === BookingStatus.PENDING) {
    const userId = booking.userId;
    if (userId) {
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(${BigInt(userId)})`;

        const conflictingBooking = await tx.booking.findFirst({
          where: {
            userId,
            status: BookingStatus.ACCEPTED,
            id: { not: bookingId },
            startTime: { lt: booking.endTime },
            endTime: { gt: booking.startTime },
          },
          select: { id: true },
        });

        if (conflictingBooking) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A confirmed booking already exists that overlaps with this time slot",
          });
        }

        const updated = await tx.booking.updateMany({
          where: { id: bookingId, status: BookingStatus.PENDING },
          data: { status: BookingStatus.ACCEPTED },
        });

        if (updated.count === 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Booking was already confirmed or rejected by another request",
          });
        }
      });

      if (booking.payment.length > 0 && !booking.paid) {
        // Payment path: status already ACCEPTED; return early.
        return { message: "Booking confirmed", status: BookingStatus.ACCEPTED };
      }
      // Non-payment path: falls through to handleConfirmation below, which writes
      // status=ACCEPTED again (idempotent) and attaches calendar references and metadata.
    } else if (booking.payment.length > 0 && !booking.paid) {
      // No userId: payment path without overlap check.
      const updated = await prisma.booking.updateMany({
        where: { id: bookingId, status: BookingStatus.PENDING },
        data: { status: BookingStatus.ACCEPTED },
      });
      if (updated.count === 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Booking was already confirmed by another request" });
      }
      return { message: "Booking confirmed", status: BookingStatus.ACCEPTED };
    }
  }

  // Cache translations to avoid requesting multiple times.
  const translations = new Map();
  const attendeesListPromises = booking.attendees.map(async (attendee) => {
    const locale = attendee.locale ?? "en";
    let translate = translations.get(locale);
    if (!translate) {
      translate = await getTranslation(locale, "common");
      translations.set(locale, translate);
    }
    return {
      name: attendee.name,
      email: attendee.email,
      timeZone: attendee.timeZone,
      phoneNumber: attendee.phoneNumber,
      language: {
        translate,
        locale,
      },
    };
  });

  const organizerOrganizationProfile = await prisma.profile.findFirst({
    where: {
      userId: user.id,
    },
  });

  const organizerOrganizationId = organizerOrganizationProfile?.organizationId;

  const bookerUrl = WEBAPP_URL;

  const attendeesList = await Promise.all(attendeesListPromises);
  const tOrganizer = await getTranslation(booking.user?.locale ?? "en", "common");

  const evt: CalendarEvent = {
    type: booking?.eventType?.slug as string,
    title: booking.title,
    description: booking.eventType?.description ?? null,
    bookerUrl,
    // TODO: Remove the usage of `bookingFields` in computing responses. We can do that by storing `label` with the response. Also, this would allow us to correctly show the label for a field even after the Event Type has been deleted.
    ...getCalEventResponses({
      bookingFields: booking.eventType?.bookingFields ?? null,
      booking,
    }),
    customInputs: isPrismaObjOrUndefined(booking.customInputs),
    startTime: booking.startTime.toISOString(),
    endTime: booking.endTime.toISOString(),
    organizer: {
      id: booking.user?.id,
      email: booking?.userPrimaryEmail || booking.user?.email || "Email-less",
      name: booking.user?.name || "Nameless",
      username: booking.user?.username || undefined,
      usernameInOrg: organizerOrganizationProfile?.username || undefined,
      timeZone: booking.user?.timeZone || "Europe/London",
      timeFormat: getTimeFormatStringFromUserTimeFormat(booking.user?.timeFormat),
      language: { translate: tOrganizer, locale: booking.user?.locale ?? "en" },
    },
    attendees: attendeesList,
    location: booking.location ?? "",
    uid: booking.uid,
    destinationCalendar: booking.destinationCalendar
      ? [booking.destinationCalendar]
      : booking.user?.destinationCalendar
        ? [booking.user?.destinationCalendar]
        : [],
    requiresConfirmation: booking?.eventType?.requiresConfirmation ?? false,
    hideOrganizerEmail: booking.eventType?.hideOrganizerEmail,
    hideCalendarNotes: booking.eventType?.hideCalendarNotes,
    hideCalendarEventDetails: booking.eventType?.hideCalendarEventDetails,
    eventTypeId: booking.eventType?.id,
    customReplyToEmail: booking.eventType?.customReplyToEmail,
    seatsPerTimeSlot: booking.eventType?.seatsPerTimeSlot,
    seatsShowAttendees: booking.eventType?.seatsShowAttendees,
    disableCancelling: booking.eventType?.disableCancelling ?? false,
    disableRescheduling: booking.eventType?.disableRescheduling ?? false,
    team: booking.eventType?.team
      ? {
          name: booking.eventType.team.name,
          id: booking.eventType.team.id,
          members: [],
        }
      : undefined,
    ...(platformClientParams ? platformClientParams : {}),
    organizationId: organizerOrganizationId ?? booking.eventType?.team?.parentId ?? null,
    additionalNotes: booking.description,
    assignmentReason: booking.assignmentReason?.[0]?.reasonEnum
      ? {
          category: getAssignmentReasonCategory(booking.assignmentReason[0].reasonEnum),
          details: booking.assignmentReason[0].reasonString ?? null,
        }
      : null,
    hideBranding: booking.eventType?.id
      ? await getEventTypeService().shouldHideBrandingForEventType(booking.eventType.id, {
          team: booking.eventType.team
            ? { hideBranding: booking.eventType.team.hideBranding, parent: booking.eventType.team.parent }
            : null,
          owner: {
            id: user.id,
            hideBranding: user.hideBranding,
            profiles: user.profiles ?? [],
          },
        } satisfies EventTypeBrandingData)
      : false,
  };

  const recurringEvent = parseRecurringEvent(booking.eventType?.recurringEvent);
  if (recurringEventId) {
    if (
      !(await prisma.booking.findFirst({
        where: {
          recurringEventId,
          id: booking.id,
        },
        select: {
          id: true,
        },
      }))
    ) {
      // FIXME: It might be best to retrieve recurringEventId from the booking itself.
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Recurring event id doesn't belong to the booking",
      });
    }
  }
  const traceContext = {
    ...ctx.traceContext,
    bookingUid: booking.uid || "unknown",
    confirmed: String(confirmed),
    eventTypeId: booking.eventType?.id?.toString() || "null",
    userId: user.id.toString(),
    teamId: booking.eventType?.teamId?.toString() || "null",
  };

  if (recurringEventId && recurringEvent) {
    const groupedRecurringBookings = await prisma.booking.groupBy({
      where: {
        recurringEventId: booking.recurringEventId,
      },
      by: [Prisma.BookingScalarFieldEnum.recurringEventId],
      _count: true,
    });
    // Overriding the recurring event configuration count to be the actual number of events booked for
    // the recurring event (equal or less than recurring event configuration count)
    recurringEvent.count = groupedRecurringBookings[0]._count;
    // count changed, parsing again to get the new value in
    evt.recurringEvent = parseRecurringEvent(recurringEvent);
  }

  if (confirmed) {
    const credentials = await getUsersCredentialsIncludeServiceAccountKey(user);
    const userWithCredentials = {
      ...user,
      credentials,
    };
    const allCredentials = await getAllCredentialsIncludeServiceAccountKey(userWithCredentials, {
      ...booking.eventType,
      metadata: booking.eventType?.metadata as EventTypeMetadata,
    });
    const conferenceCredentialId = getLocationValueForDB(
      booking.location ?? "",
      (booking.eventType?.locations as LocationObject[]) || []
    );
    evt.conferenceCredentialId = conferenceCredentialId.conferenceCredentialId;

    try {
      await handleConfirmation({
        user: { ...user, credentials: allCredentials },
        evt,
        recurringEventId,
        prisma,
        bookingId,
        booking,
        emailsEnabled,
        platformClientParams,
        traceContext,
      });
    } catch (err) {
      // If we pre-claimed ACCEPTED via the advisory lock path and handleConfirmation
      // fails, restore the booking to PENDING so the confirmation can be retried.
      // When the booking was not pre-claimed this updateMany matches 0 rows (no-op).
      await prisma.booking.updateMany({
        where: { id: bookingId, status: BookingStatus.ACCEPTED },
        data: { status: BookingStatus.PENDING },
      });
      throw err;
    }
  } else {
    evt.rejectionReason = rejectionReason;
    let rejectedBookings: {
      uid: string;
      oldStatus: BookingStatus;
    }[] = [];

    if (recurringEventId) {
      // The booking to reject is a recurring event and comes from /booking/upcoming, proceeding to mark all related
      // bookings as rejected.
      const unconfirmedRecurringBookings = await prisma.booking.findMany({
        where: {
          recurringEventId,
          status: BookingStatus.PENDING,
        },
        select: {
          uid: true,
          status: true,
        },
      });

      await prisma.booking.updateMany({
        where: {
          uid: {
            in: unconfirmedRecurringBookings.map((booking) => booking.uid),
          },
        },
        data: {
          status: BookingStatus.REJECTED,
          rejectionReason,
        },
      });

      rejectedBookings = unconfirmedRecurringBookings.map((recurringBooking) => ({
        uid: recurringBooking.uid,
        oldStatus: recurringBooking.status,
      }));
    } else {
      // handle refunds
      if (booking.payment.length) {
        await processPaymentRefund({
          booking: booking,
          teamId: booking.eventType?.teamId,
        });
      }
      // end handle refunds.

      await prisma.booking.update({
        where: {
          id: bookingId,
        },
        data: {
          status: BookingStatus.REJECTED,
          rejectionReason,
        },
      });

      rejectedBookings = [
        {
          uid: booking.uid,
          oldStatus: booking.status,
        },
      ];
    }

    if (emailsEnabled) {
      await sendDeclinedEmailsAndSMS(evt, booking.eventType?.metadata as EventTypeMetadata);
    }

    const teamId = await getTeamIdFromEventType({
      eventType: {
        team: { id: booking.eventType?.teamId ?? null },
        parentId: booking?.eventType?.parentId ?? null,
      },
    });

    const orgId = await getOrgIdFromMemberOrTeamId({ memberId: booking.userId, teamId });

    // send BOOKING_REJECTED webhooks
    const subscriberOptions: GetSubscriberOptions = {
      userId: booking.userId,
      eventTypeId: booking.eventTypeId,
      triggerEvent: WebhookTriggerEvents.BOOKING_REJECTED,
      teamId,
      orgId,
      oAuthClientId: platformClientParams?.platformClientId,
    };
    const eventTrigger: WebhookTriggerEvents = WebhookTriggerEvents.BOOKING_REJECTED;
    const eventTypeInfo: EventTypeInfo = {
      eventTitle: booking.eventType?.title,
      eventDescription: booking.eventType?.description,
      requiresConfirmation: booking.eventType?.requiresConfirmation || null,
      price: booking.eventType?.price,
      currency: booking.eventType?.currency,
      length: booking.eventType?.length,
    };
    const webhookData: EventPayloadType = {
      ...evt,
      ...eventTypeInfo,
      bookingId,
      eventTypeId: booking.eventType?.id,
      status: BookingStatus.REJECTED,
      smsReminderNumber: booking.smsReminderNumber || undefined,
    };
    await handleWebhookTrigger({ subscriberOptions, eventTrigger, webhookData, traceContext });

  }

  const message = confirmed ? "Booking confirmed" : "Booking rejected";
  const status = confirmed ? BookingStatus.ACCEPTED : BookingStatus.REJECTED;

  return { message, status };
};
