import process from "node:process";
import { DailyLocationType } from "@calcom/app-store/constants";
import { FAKE_DAILY_CREDENTIAL } from "@calcom/app-store/dailyvideo/lib/VideoApiAdapter";
import { eventTypeMetaDataSchemaWithTypedApps } from "@calcom/app-store/zod-utils";
import dayjs from "@calcom/dayjs";
import { sendCancelledEmailsAndSMS } from "@calcom/emails/email-manager";
import { BookingReferenceRepository } from "@calcom/features/bookingReference/repositories/BookingReferenceRepository";
import EventManager from "@calcom/features/bookings/lib/EventManager";
import { getCalEventResponses } from "@calcom/features/bookings/lib/getCalEventResponses";
import { processNoShowFeeOnCancellation } from "@calcom/features/bookings/lib/payment/processNoShowFeeOnCancellation";
import { processPaymentRefund } from "@calcom/features/bookings/lib/payment/processPaymentRefund";
import {
  type EventTypeBrandingData,
  getEventTypeService,
} from "@calcom/features/eventtypes/di/EventTypeService.container";
import { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import type { GetSubscriberOptions } from "@calcom/features/webhooks/lib/getWebhooks";
import getWebhooks from "@calcom/features/webhooks/lib/getWebhooks";
import {
  cancelNoShowTasksForBooking,
  deleteWebhookScheduledTriggers,
} from "@calcom/features/webhooks/lib/scheduleTrigger";
import sendPayload from "@calcom/features/webhooks/lib/sendOrSchedulePayload";
import type { EventTypeInfo } from "@calcom/features/webhooks/lib/sendPayload";
import { getTranslation } from "@calcom/i18n/server";
import { HttpError } from "@calcom/lib/http-error";
import { isPrismaObjOrUndefined } from "@calcom/lib/isPrismaObj";
import { parseRecurringEvent } from "@calcom/lib/isRecurringEvent";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import { getTimeFormatStringFromUserTimeFormat } from "@calcom/lib/timeFormat";
// TODO: Prisma import would be used from DI in a followup PR when we remove `handler` export
import prisma from "@calcom/prisma";
import type { WebhookTriggerEvents } from "@calcom/prisma/enums";
import { BookingStatus } from "@calcom/prisma/enums";
import type { EventTypeMetadata } from "@calcom/prisma/zod-utils";
import { bookingCancelInput } from "@calcom/prisma/zod-utils";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type { z } from "zod";
import { BookingRepository } from "../repositories/BookingRepository";
import { PrismaBookingAttendeeRepository } from "../repositories/PrismaBookingAttendeeRepository";
import { isCancellationReasonRequired } from "./cancellationReason";
import type {
  CancelBookingMeta,
  CancelRegularBookingData,
  HandleCancelBookingResponse,
} from "./dto/BookingCancel";
import { getAllCredentialsIncludeServiceAccountKey } from "./getAllCredentialsForUsersOnEvent/getAllCredentials";
import { getBookingToDelete } from "./getBookingToDelete";
import cancelAttendeeSeat from "./handleSeats/cancel/cancelAttendeeSeat";
import { getSeatCalendarReferences, OFFICE365_CALENDAR_TYPE } from "./handleSeats/lib/seatCalendarReferences";
import type { IBookingCancelService } from "./interfaces/IBookingCancelService";
import { isPrismaError } from "@calcom/lib/server/getServerErrorFromUnknown";

const log = logger.getSubLogger({ prefix: ["handleCancelBooking"] });

type PlatformParams = {
  platformClientId?: string;
  platformRescheduleUrl?: string;
  platformCancelUrl?: string;
  platformBookingUrl?: string;
  arePlatformEmailsEnabled?: boolean;
};

export type BookingToDelete = Awaited<ReturnType<typeof getBookingToDelete>>;

export type CancelBookingInput = {
  userId?: number;
  userUuid?: string;
  bookingData: z.infer<typeof bookingCancelInput>;
  actionSource?: string;
  actor?: unknown;
} & PlatformParams;

type Dependencies = {
  userRepository: UserRepository;
  bookingRepository: BookingRepository;
  bookingReferenceRepository: BookingReferenceRepository;
  attendeeRepository: PrismaBookingAttendeeRepository;
};

/**
 * Cancels a booking and cleans up notifications, integrations, and references.
 *
 * @param input - Cancellation request and platform context.
 * @param dependencies - Optional repositories used by the cancellation flow.
 * @returns Cancellation result for the requested booking.
 */
async function handler(input: CancelBookingInput, dependencies?: Dependencies) {
  const prismaClient = prisma;
  const { userRepository, bookingRepository, bookingReferenceRepository, attendeeRepository } =
    dependencies || {
      userRepository: new UserRepository(prismaClient),
      bookingRepository: new BookingRepository(prismaClient),
      bookingReferenceRepository: new BookingReferenceRepository({ prismaClient }),
      attendeeRepository: new PrismaBookingAttendeeRepository(prismaClient),
    };
  const body = input.bookingData;
  const {
    id,
    uid,
    allRemainingBookings,
    cancellationReason,
    seatReferenceUid,
    cancelledBy,
    cancelSubsequentBookings,
    skipCancellationReasonValidation = false,
    skipCalendarSyncTaskCancellation = false,
  } = bookingCancelInput.parse(body);
  let bookingToDelete: BookingToDelete
  try {
    bookingToDelete = await getBookingToDelete(id, uid);
  } catch (error) {
    if (isPrismaError(error) && error.code === "P2025") // Record not found
    {
      throw new HttpError({
        statusCode: 404,
        message: "Booking not found.",
      });
    }
    throw error;
  }
  const {
    userId,
    platformBookingUrl,
    platformCancelUrl,
    platformClientId,
    platformRescheduleUrl,
    arePlatformEmailsEnabled,
  } = input;

  /**
   * Important: We prevent cancelling an already cancelled booking.
   * A booking could have been CANCELLED due to a reschedule,
   * in which case we simply update the existing calendar event and meeting.
   * We want to avoid deleting them by a subsequent cancellation attempt.
   */
  if (bookingToDelete.status === BookingStatus.CANCELLED) {
    throw new HttpError({
      statusCode: 400,
      message: "This booking has already been cancelled.",
    });
  }

  if (!bookingToDelete.userId || !bookingToDelete.user) {
    throw new HttpError({ statusCode: 400, message: "User not found" });
  }

  if (bookingToDelete.eventType?.disableCancelling) {
    throw new HttpError({
      statusCode: 400,
      message: "This event type does not allow cancellations",
    });
  }

  const isCancellationUserHost =
    bookingToDelete.userId === userId || bookingToDelete.user.email === cancelledBy;

  const isReasonRequired = isCancellationReasonRequired(
    bookingToDelete.eventType?.requiresCancellationReason,
    isCancellationUserHost
  );

  if (
    !platformClientId &&
    !cancellationReason?.trim() &&
    isReasonRequired &&
    !skipCancellationReasonValidation
  ) {
    throw new HttpError({
      statusCode: 400,
      message: "Cancellation reason is required",
    });
  }

  if (bookingToDelete.endTime && new Date() > new Date(bookingToDelete.endTime)) {
    throw new HttpError({
      statusCode: 400,
      message: "Cannot cancel a booking that has already ended",
    });
  }

  // If the booking is a seated event and there is no seatReferenceUid we should validate that logged in user is host
  if (bookingToDelete.eventType?.seatsPerTimeSlot && !seatReferenceUid) {
    const userIsHost = bookingToDelete.eventType.hosts.find((host) => {
      if (host.user.id === userId) return true;
    });

    const userIsOwnerOfEventType = bookingToDelete.eventType.owner?.id === userId;

    if (!userIsHost && !userIsOwnerOfEventType) {
      throw new HttpError({
        statusCode: 401,
        message: "User not a host of this event",
      });
    }
  }

  // get webhooks
  const eventTrigger: WebhookTriggerEvents = "BOOKING_CANCELLED";

  const subscriberOptions: GetSubscriberOptions = {
    userId: bookingToDelete.userId,
    eventTypeId: bookingToDelete.eventTypeId as number,
    triggerEvent: eventTrigger,
    teamId: null,
    orgId: undefined,
    oAuthClientId: platformClientId,
  };

  const eventTypeInfo: EventTypeInfo = {
    eventTitle: bookingToDelete?.eventType?.title || null,
    eventDescription: bookingToDelete?.eventType?.description || null,
    requiresConfirmation: bookingToDelete?.eventType?.requiresConfirmation || null,
    price: bookingToDelete?.eventType?.price || null,
    currency: bookingToDelete?.eventType?.currency || null,
    length: bookingToDelete?.eventType?.length || null,
  };

  const webhooks = await getWebhooks(subscriberOptions);

  const organizer = await userRepository.findByIdOrThrow({
    id: bookingToDelete.userId,
  });

  const attendeesListPromises = [];

  for (const attendee of bookingToDelete.attendees) {
    attendeesListPromises.push({
      name: attendee.name,
      email: attendee.email,
      timeZone: attendee.timeZone,
      phoneNumber: attendee.phoneNumber,
      language: {
        translate: await getTranslation(attendee.locale ?? "en", "common"),
        locale: attendee.locale ?? "en",
      },
    });
  }

  const attendeesList = await Promise.all(attendeesListPromises);
  const tOrganizer = await getTranslation(organizer.locale ?? "en", "common");

  const bookerUrl = process.env.NEXT_PUBLIC_WEBAPP_URL || "https://app.cal.com";

  const evt: CalendarEvent = {
    bookerUrl,
    title: bookingToDelete?.title,
    length: bookingToDelete?.eventType?.length,
    type: bookingToDelete?.eventType?.slug as string,
    additionalNotes: bookingToDelete?.description,
    description: bookingToDelete.eventType?.description,
    customInputs: isPrismaObjOrUndefined(bookingToDelete.customInputs),
    eventTypeId: bookingToDelete.eventTypeId as number,
    ...getCalEventResponses({
      bookingFields: bookingToDelete.eventType?.bookingFields ?? null,
      booking: bookingToDelete,
    }),
    startTime: bookingToDelete?.startTime ? dayjs(bookingToDelete.startTime).format() : "",
    endTime: bookingToDelete?.endTime ? dayjs(bookingToDelete.endTime).format() : "",
    organizer: {
      id: organizer.id,
      username: organizer.username || undefined,
      email: bookingToDelete?.userPrimaryEmail ?? organizer.email,
      name: organizer.name ?? "Nameless",
      timeZone: organizer.timeZone,
      timeFormat: getTimeFormatStringFromUserTimeFormat(organizer.timeFormat),
      language: { translate: tOrganizer, locale: organizer.locale ?? "en" },
    },
    attendees: attendeesList,
    uid: bookingToDelete?.uid,
    bookingId: bookingToDelete?.id,
    /* Include recurringEvent information only when cancelling all bookings */
    recurringEvent: allRemainingBookings
      ? parseRecurringEvent(bookingToDelete.eventType?.recurringEvent)
      : undefined,
    location: bookingToDelete?.location,
    destinationCalendar: bookingToDelete?.destinationCalendar
      ? [bookingToDelete?.destinationCalendar]
      : bookingToDelete?.user.destinationCalendar
        ? [bookingToDelete?.user.destinationCalendar]
        : [],
    cancellationReason: cancellationReason,
    seatsPerTimeSlot: bookingToDelete.eventType?.seatsPerTimeSlot,
    seatsShowAttendees: bookingToDelete.eventType?.seatsShowAttendees,
    iCalUID: bookingToDelete.iCalUID,
    iCalSequence: bookingToDelete.iCalSequence + 1,
    platformClientId,
    platformRescheduleUrl,
    platformCancelUrl,
    hideOrganizerEmail: bookingToDelete.eventType?.hideOrganizerEmail,
    platformBookingUrl,
    customReplyToEmail: bookingToDelete.eventType?.customReplyToEmail,
    schedulingType: bookingToDelete.eventType?.schedulingType,
    hideBranding: bookingToDelete.eventTypeId
      ? await getEventTypeService().shouldHideBrandingForEventType(bookingToDelete.eventTypeId, {
          team: bookingToDelete.eventType?.team
            ? {
                hideBranding: bookingToDelete.eventType.team.hideBranding,
                parent: bookingToDelete.eventType.team.parent,
              }
            : null,
          owner: bookingToDelete.user
            ? {
                id: bookingToDelete.user.id,
                hideBranding: bookingToDelete.user.hideBranding,
                profiles: bookingToDelete.user.profiles ?? [],
              }
            : null,
        } satisfies EventTypeBrandingData)
      : false,
  };

  const dataForWebhooks = { evt, webhooks, eventTypeInfo };

  // If it's just an attendee of a booking then just remove them from that booking
  const result = await cancelAttendeeSeat(
    {
      seatReferenceUid: seatReferenceUid,
      bookingToDelete,
    },
    dataForWebhooks,
    bookingToDelete?.eventType?.metadata as EventTypeMetadata
  );
  if (result)
    return {
      success: true,
      onlyRemovedAttendee: true,
      bookingId: bookingToDelete.id,
      bookingUid: bookingToDelete.uid,
      message: "Attendee successfully removed.",
      isPlatformManagedUserBooking: bookingToDelete.user.isPlatformManaged,
    } satisfies HandleCancelBookingResponse;

  const promises = webhooks.map((webhook) =>
    sendPayload(webhook.secret, eventTrigger, new Date().toISOString(), webhook, {
      ...evt,
      ...eventTypeInfo,
      status: "CANCELLED",
      smsReminderNumber: bookingToDelete.smsReminderNumber || undefined,
      cancelledBy: cancelledBy,
      requestReschedule: false,
    }).catch((e) => {
      logger.error(
        `Error executing webhook for event: ${eventTrigger}, URL: ${webhook.subscriberUrl}, bookingId: ${evt.bookingId}, bookingUid: ${evt.uid}`,
        safeStringify(e)
      );
    })
  );
  await Promise.all(promises);

  let updatedBookings: {
    id: number;
    uid: string;
    references: {
      type: string;
      credentialId: number | null;
      uid: string;
      externalCalendarId: string | null;
    }[];
    startTime: Date;
    endTime: Date;
  }[] = [];

  // by cancelling first, and blocking whilst doing so; we can ensure a cancel
  // action always succeeds even if subsequent integrations fail cancellation.
  if (
    bookingToDelete.eventType?.recurringEvent &&
    bookingToDelete.recurringEventId &&
    (allRemainingBookings || cancelSubsequentBookings)
  ) {
    const recurringEventId = bookingToDelete.recurringEventId;
    const gte = cancelSubsequentBookings ? bookingToDelete.startTime : new Date();
    // Proceed to mark as cancelled all remaining recurring events instances (greater than or equal to right now)
    await bookingRepository.updateMany({
      where: {
        recurringEventId,
        startTime: {
          gte,
        },
      },
      data: {
        status: BookingStatus.CANCELLED,
        cancellationReason: cancellationReason,
        cancelledBy: cancelledBy,
      },
    });
    const allUpdatedBookings = await bookingRepository.findManyIncludeReferences({
      where: {
        recurringEventId: bookingToDelete.recurringEventId,
        startTime: {
          gte: new Date(),
        },
      },
    });
    updatedBookings = updatedBookings.concat(allUpdatedBookings);
  } else {
    if (bookingToDelete?.eventType?.seatsPerTimeSlot) {
      await attendeeRepository.deleteManyByBookingId(bookingToDelete.id);
    }

    const updatedBooking = await bookingRepository.updateIncludeReferences({
      where: {
        uid: bookingToDelete.uid,
      },
      data: {
        status: BookingStatus.CANCELLED,
        cancellationReason: cancellationReason,
        cancelledBy: cancelledBy,
        // Assume that canceling the booking is the last action
        iCalSequence: evt.iCalSequence || 100,
      },
    });

    updatedBookings.push(updatedBooking);

    if (bookingToDelete.payment.some((payment) => payment.paymentOption === "ON_BOOKING")) {
      try {
        await processPaymentRefund({
          booking: bookingToDelete,
        });
      } catch (error) {
        log.error(`Error processing payment refund for booking ${bookingToDelete.uid}:`, error);
      }
    } else if (bookingToDelete.payment.some((payment) => payment.paymentOption === "HOLD")) {
      try {
        await processNoShowFeeOnCancellation({
          booking: bookingToDelete,
          payments: bookingToDelete.payment,
          cancelledByUserId: userId,
        });
      } catch (error) {
        log.error(`Error processing no-show fee for booking ${bookingToDelete.uid}:`, error);
      }
    }
  }

  /** TODO: Remove this without breaking functionality */
  if (bookingToDelete.location === DailyLocationType) {
    bookingToDelete.user.credentials.push({
      ...FAKE_DAILY_CREDENTIAL,
      teamId: null,
    });
  }

  const isBookingInRecurringSeries = !!(
    bookingToDelete.eventType?.recurringEvent &&
    bookingToDelete.recurringEventId &&
    allRemainingBookings
  );

  // Skip calendar event deletion when cancellation comes from a calendar subscription webhook
  // to avoid infinite loops (Google/Office365 → Cal.diy → Google/Office365 → ...)
  if (!skipCalendarSyncTaskCancellation) {
    try {
      const bookingToDeleteEventTypeMetadataParsed = eventTypeMetaDataSchemaWithTypedApps.safeParse(
        bookingToDelete.eventType?.metadata || null
      );

      if (!bookingToDeleteEventTypeMetadataParsed.success) {
        log.error(
          `Error parsing metadata`,
          safeStringify({ error: bookingToDeleteEventTypeMetadataParsed?.error })
        );
        throw new Error("Error parsing metadata");
      }

      const bookingToDeleteEventTypeMetadata = bookingToDeleteEventTypeMetadataParsed.data;

      const credentials = await getAllCredentialsIncludeServiceAccountKey(bookingToDelete.user, {
        ...bookingToDelete.eventType,
        metadata: bookingToDeleteEventTypeMetadata,
      });

      const eventManager = new EventManager(
        { ...bookingToDelete.user, credentials },
        bookingToDeleteEventTypeMetadata?.apps
      );

      const seatOffice365CalendarReferences = bookingToDelete.seatsReferences.flatMap(
        /**
         * Reads Office365 calendar references stored on an individual booking seat.
         *
         * @param seatReference - Booking seat reference to inspect.
         * @returns Office365 calendar references stored for the seat.
         */
        (seatReference) => getSeatCalendarReferences(seatReference.metadata, OFFICE365_CALENDAR_TYPE)
      );
      const referencesToCancelByKey = new Map(
        [...bookingToDelete.references, ...seatOffice365CalendarReferences].map(
          /**
           * Builds a dedupe key for booking-level and seat-level cancellation references.
           *
           * @param reference - Calendar or integration reference to dedupe.
           * @returns Tuple containing the dedupe key and original reference.
           */
          (reference) => [
            JSON.stringify([
              reference.type,
              reference.uid,
              reference.externalCalendarId,
              reference.credentialId,
              reference.delegationCredentialId,
            ]),
            reference,
          ]
        )
      );

      await eventManager.cancelEvent(
        evt,
        Array.from(referencesToCancelByKey.values()),
        isBookingInRecurringSeries
      );
    } catch (error) {
      log.error(`Error deleting integrations`, safeStringify({ error }));
    }
  }

  // Always mark booking references as deleted for data consistency
  // (even when skipCalendarSyncTaskCancellation is true, since the external event is already deleted)
  try {
    await bookingReferenceRepository.updateManyByBookingId(bookingToDelete.id, { deleted: true });
  } catch (error) {
    log.error(`Error marking booking references as deleted`, safeStringify({ error }));
  }

  try {
    const webhookTriggerPromises = [];
    for (const booking of updatedBookings) {
      webhookTriggerPromises.push(deleteWebhookScheduledTriggers({ booking }));
      webhookTriggerPromises.push(cancelNoShowTasksForBooking({ bookingUid: booking.uid }));
    }

    await Promise.allSettled(webhookTriggerPromises).then((results) => {
      const rejectedReasons = results
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) => result.reason);

      if (rejectedReasons.length > 0) {
        log.error("An error occurred when deleting webhook triggers", rejectedReasons);
      }
    });
  } catch (error) {
    log.error("Error deleting scheduled webhooks", safeStringify({ error }));
  }

  try {
    // TODO: if emails fail try to requeue them
    if (!platformClientId || (platformClientId && arePlatformEmailsEnabled))
      await sendCancelledEmailsAndSMS(
        evt,
        { eventName: bookingToDelete?.eventType?.eventName },
        bookingToDelete?.eventType?.metadata as EventTypeMetadata
      );
  } catch (error) {
    log.error("Error deleting event", error);
  }
  return {
    success: true,
    message: "Booking successfully cancelled.",
    onlyRemovedAttendee: false,
    bookingId: bookingToDelete.id,
    bookingUid: bookingToDelete.uid,
    isPlatformManagedUserBooking: bookingToDelete.user.isPlatformManaged,
  } satisfies HandleCancelBookingResponse;
}

type BookingCancelServiceDependencies = {
  userRepository: UserRepository;
  bookingRepository: BookingRepository;
  profileRepository?: unknown;
  bookingReferenceRepository: BookingReferenceRepository;
  attendeeRepository: PrismaBookingAttendeeRepository;
};

/**
 * Takes care of cancelling bookings. This includes regular bookings, recurring bookings, seated bookings, etc.
 * Handles both individual booking cancellations and bulk cancellations for recurring events.
 */
export class BookingCancelService implements IBookingCancelService {
  constructor(private readonly deps: BookingCancelServiceDependencies) {}

  async cancelBooking(input: { bookingData: CancelRegularBookingData; bookingMeta?: CancelBookingMeta }) {
    const cancelBookingInput: CancelBookingInput = {
      bookingData: input.bookingData,
      ...(input.bookingMeta || {}),
    };

    return handler(cancelBookingInput, this.deps);
  }
}

export default handler;
