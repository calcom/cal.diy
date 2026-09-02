import { eventTypeAppMetadataOptionalSchema } from "@calcom/app-store/zod-utils";
import { sendScheduledEmailsAndSMS } from "@calcom/emails/email-manager";
import type { EventManagerUser } from "@calcom/features/bookings/lib/EventManager";
import EventManager from "@calcom/features/bookings/lib/EventManager";
import getWebhooks from "@calcom/features/webhooks/lib/getWebhooks";
import { scheduleTrigger } from "@calcom/features/webhooks/lib/scheduleTrigger";
import sendPayload from "@calcom/features/webhooks/lib/sendOrSchedulePayload";
import type { EventPayloadType, EventTypeInfo } from "@calcom/features/webhooks/lib/sendPayload";
import { getVideoCallUrlFromCalEvent } from "@calcom/lib/CalEventParser";
import { safeStringify } from "@calcom/lib/safeStringify";
import type { TraceContext } from "@calcom/lib/tracing";
import { distributedTracing } from "@calcom/lib/tracing/factory";
import type { PrismaClient } from "@calcom/prisma";
import { handleAppsStatus } from "./handleNewBooking/handleAppsStatus";
import type { Prisma } from "@calcom/prisma/client";
import type { SchedulingType } from "@calcom/prisma/enums";
import { BookingStatus, WebhookTriggerEvents } from "@calcom/prisma/enums";
import type { PlatformClientParams } from "@calcom/prisma/zod-utils";
import { EventTypeMetaDataSchema } from "@calcom/prisma/zod-utils";
import type { AdditionalInformation, CalendarEvent } from "@calcom/types/Calendar";
import { getCalEventResponses } from "./getCalEventResponses";
import { scheduleNoShowTriggers } from "./handleNewBooking/scheduleNoShowTriggers";

export async function handleConfirmation(args: {
  user: EventManagerUser & { username: string | null };
  evt: CalendarEvent;
  recurringEventId?: string;
  prisma: PrismaClient;
  bookingId: number;
  booking: {
    startTime: Date;
    id: number;
    uid: string;
    eventType: {
      currency: string;
      description: string | null;
      id: number;
      length: number;
      price: number;
      requiresConfirmation: boolean;
      metadata?: Prisma.JsonValue;
      title: string;
      team?: {
        parentId: number | null;
      } | null;
      teamId?: number | null;
      parentId?: number | null;
      parent?: {
        teamId: number | null;
      } | null;
    } | null;
    metadata?: Prisma.JsonValue;
    eventTypeId: number | null;
    smsReminderNumber: string | null;
    userId: number | null;
    location: string | null;
    status: BookingStatus;
  };
  paid?: boolean;
  emailsEnabled?: boolean;
  platformClientParams?: PlatformClientParams;
  traceContext: TraceContext;
}) {
  const {
    user,
    evt,
    recurringEventId,
    prisma,
    bookingId,
    booking,
    paid,
    emailsEnabled = true,
    platformClientParams,
    traceContext,
  } = args;
  const eventType = booking.eventType;
  const eventTypeMetadata = EventTypeMetaDataSchema.parse(eventType?.metadata || {});
  const apps = eventTypeAppMetadataOptionalSchema.parse(eventTypeMetadata?.apps);
  const eventManager = new EventManager(user, apps);
  const areCalendarEventsEnabled = platformClientParams?.areCalendarEventsEnabled ?? true;
  const scheduleResult = await eventManager.create(evt, { skipCalendarEvent: !areCalendarEventsEnabled });
  const results = scheduleResult.results;
  const metadata: AdditionalInformation = {};
  const spanContext = distributedTracing.createSpan(traceContext, "handle_confirmation");

  const tracingLogger = distributedTracing.getTracingLogger(spanContext);

  if (results.length > 0 && results.every((res) => !res.success)) {
    const error = {
      errorCode: "BookingCreatingMeetingFailed",
      message: "Booking failed",
    };

    tracingLogger.error(`Booking ${user.username} failed`, safeStringify({ error, results }));
  }
  if (results.length) {
    // TODO: Handle created event metadata more elegantly
    metadata.hangoutLink = results[0].createdEvent?.hangoutLink;
    metadata.conferenceData = results[0].createdEvent?.conferenceData;
    metadata.entryPoints = results[0].createdEvent?.entryPoints;
  }
  // ponytail: populate appsStatus before any notification so all-failed calendar still shows ❌ warnings
  evt.appsStatus = handleAppsStatus(results, booking as never, undefined);
  let updatedBookings: {
    id: number;
    status: BookingStatus;
    description: string | null;
    location: string | null;
    attendees: {
      name: string;
      email: string;
      phoneNumber?: string | null;
    }[];
    startTime: Date;
    endTime: Date;
    uid: string;
    smsReminderNumber: string | null;
    cancellationReason?: string | null;
    metadata: Prisma.JsonValue | null;
    customInputs: Prisma.JsonValue;
    title: string;
    responses: Prisma.JsonValue;
    eventType: {
      bookingFields: Prisma.JsonValue | null;
      slug: string;
      schedulingType: SchedulingType | null;
      hosts: {
        user: {
          email: string;
          destinationCalendar?: {
            primaryEmail: string | null;
          } | null;
        };
      }[];
      owner: {
        hideBranding?: boolean | null;
      } | null;
    } | null;
  }[] = [];

  const videoCallUrl = metadata.hangoutLink ? metadata.hangoutLink : evt.videoCallData?.url || "";
  const meetingUrl = getVideoCallUrlFromCalEvent(evt) || videoCallUrl;

  let acceptedBookings: {
    oldStatus: BookingStatus;
    uid: string;
  }[];
  if (recurringEventId) {
    // The booking to confirm is a recurring event and comes from /booking/recurring, proceeding to mark all related
    // bookings as confirmed. Prisma updateMany does not support relations, so doing this in two steps for now.
    const unconfirmedRecurringBookings = await prisma.booking.findMany({
      where: {
        recurringEventId,
        status: BookingStatus.PENDING,
      },
    });

    acceptedBookings = unconfirmedRecurringBookings.map((booking) => ({
      oldStatus: booking.status,
      uid: booking.uid,
    }));

    const updateBookingsPromise = unconfirmedRecurringBookings.map((recurringBooking) =>
      prisma.booking.update({
        where: {
          id: recurringBooking.id,
        },
        data: {
          status: BookingStatus.ACCEPTED,
          references: {
            create: scheduleResult.referencesToCreate,
          },
          paid,
          metadata: {
            ...(typeof recurringBooking.metadata === "object" ? recurringBooking.metadata : {}),
            videoCallUrl: meetingUrl,
          },
        },
        select: {
          eventType: {
            select: {
              slug: true,
              bookingFields: true,
              schedulingType: true,
              hosts: {
                select: {
                  user: {
                    select: {
                      email: true,
                      destinationCalendar: {
                        select: {
                          primaryEmail: true,
                        },
                      },
                    },
                  },
                },
              },
              owner: {
                select: {
                  hideBranding: true,
                },
              },
            },
          },
          status: true,
          description: true,
          cancellationReason: true,
          attendees: true,
          responses: true,
          location: true,
          title: true,
          uid: true,
          startTime: true,
          metadata: true,
          endTime: true,
          smsReminderNumber: true,
          customInputs: true,
          id: true,
        },
      })
    );

    const updatedBookingsResult = await Promise.all(updateBookingsPromise);
    updatedBookings = updatedBookings.concat(updatedBookingsResult);
  } else {
    // @NOTE: be careful with this as if any error occurs before this booking doesn't get confirmed
    // Should perform update on booking (confirm) -> then trigger the rest handlers
    const updatedBooking = await prisma.booking.update({
      where: {
        id: bookingId,
      },
      data: {
        status: BookingStatus.ACCEPTED,
        references: {
          create: scheduleResult.referencesToCreate,
        },
        metadata: {
          ...(typeof booking.metadata === "object" ? booking.metadata : {}),
          videoCallUrl: meetingUrl,
        },
      },
      select: {
        eventType: {
          select: {
            slug: true,
            bookingFields: true,
            schedulingType: true,
            owner: {
              select: {
                hideBranding: true,
              },
            },
            hosts: {
              select: {
                user: {
                  select: {
                    email: true,
                    destinationCalendar: {
                      select: {
                        primaryEmail: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        uid: true,
        status: true,
        startTime: true,
        responses: true,
        title: true,
        metadata: true,
        cancellationReason: true,
        endTime: true,
        smsReminderNumber: true,
        description: true,
        attendees: true,
        location: true,
        customInputs: true,
        id: true,
      },
    });
    updatedBookings.push(updatedBooking);
    acceptedBookings = [
      {
        oldStatus: booking.status,
        uid: booking.uid,
      },
    ];
  }

  // ponytail: send confirmation only after DB is ACCEPTED
  try {
    const isHostConfirmationEmailsDisabled =
      eventTypeMetadata?.disableStandardEmails?.confirmation?.host || false;
    const isAttendeeConfirmationEmailDisabled =
      eventTypeMetadata?.disableStandardEmails?.confirmation?.attendee || false;

    if (emailsEnabled) {
      await sendScheduledEmailsAndSMS(
        { ...evt, additionalInformation: metadata },
        undefined,
        isHostConfirmationEmailsDisabled,
        isAttendeeConfirmationEmailDisabled,
        eventTypeMetadata
      );
    }
  } catch (error) {
    tracingLogger.error(error);
  }

  const triggerForUser = true;
  const userId = booking.userId;

  try {
    const subscribersBookingCreated = await getWebhooks({
      userId,
      eventTypeId: booking.eventTypeId,
      triggerEvent: WebhookTriggerEvents.BOOKING_CREATED,
      teamId: null,
      orgId: null,
      oAuthClientId: platformClientParams?.platformClientId,
    });
    const subscribersMeetingStarted = await getWebhooks({
      userId,
      eventTypeId: booking.eventTypeId,
      triggerEvent: WebhookTriggerEvents.MEETING_STARTED,
      teamId: null,
      orgId: null,
      oAuthClientId: platformClientParams?.platformClientId,
    });
    const subscribersMeetingEnded = await getWebhooks({
      userId,
      eventTypeId: booking.eventTypeId,
      triggerEvent: WebhookTriggerEvents.MEETING_ENDED,
      teamId: null,
      orgId: null,
      oAuthClientId: platformClientParams?.platformClientId,
    });

    const scheduleTriggerPromises: Promise<unknown>[] = [];

    const updatedBookingsWithCalEventResponses = updatedBookings.map((booking) => {
      return {
        ...booking,
        ...getCalEventResponses({
          bookingFields: booking.eventType?.bookingFields ?? null,
          booking,
        }),
      };
    });

    subscribersMeetingStarted.forEach((subscriber) => {
      updatedBookingsWithCalEventResponses.forEach((booking) => {
        scheduleTriggerPromises.push(
          scheduleTrigger({
            booking,
            subscriberUrl: subscriber.subscriberUrl,
            subscriber,
            triggerEvent: WebhookTriggerEvents.MEETING_STARTED,
          })
        );
      });
    });
    subscribersMeetingEnded.forEach((subscriber) => {
      updatedBookingsWithCalEventResponses.forEach((booking) => {
        scheduleTriggerPromises.push(
          scheduleTrigger({
            booking,
            subscriberUrl: subscriber.subscriberUrl,
            subscriber,
            triggerEvent: WebhookTriggerEvents.MEETING_ENDED,
          })
        );
      });
    });

    await Promise.all(scheduleTriggerPromises);

    await scheduleNoShowTriggers({
      booking: {
        startTime: booking.startTime,
        id: booking.id,
        location: booking.location,
        uid: booking.uid,
      },
      triggerForUser,
      organizerUser: { id: booking.userId },
      eventTypeId: booking.eventTypeId,
      teamId: null,
      orgId: null,
      oAuthClientId: platformClientParams?.platformClientId,
    });

    const eventTypeInfo: EventTypeInfo = {
      eventTitle: eventType?.title,
      eventDescription: eventType?.description,
      requiresConfirmation: eventType?.requiresConfirmation || null,
      price: eventType?.price,
      currency: eventType?.currency,
      length: eventType?.length,
    };

    const payload: EventPayloadType = {
      ...evt,
      ...eventTypeInfo,
      bookingId,
      eventTypeId: eventType?.id,
      status: "ACCEPTED",
      smsReminderNumber: booking.smsReminderNumber || undefined,
      metadata: meetingUrl ? { videoCallUrl: meetingUrl } : {},
      ...(platformClientParams ? platformClientParams : {}),
    };

    const promises = subscribersBookingCreated.map((sub) =>
      sendPayload(
        sub.secret,
        WebhookTriggerEvents.BOOKING_CREATED,
        new Date().toISOString(),
        sub,
        payload
      ).catch((e) => {
        tracingLogger.error(
          `Error executing webhook for event: ${WebhookTriggerEvents.BOOKING_CREATED}, URL: ${sub.subscriberUrl}, bookingId: ${evt.bookingId}, bookingUid: ${evt.uid}, platformClientId: ${platformClientParams?.platformClientId}`,
          safeStringify(e)
        );
      })
    );

    await Promise.all(promises);
  } catch (error) {
    // Silently fail
    console.error(error);
  }
}
