import process from "node:process";
import processExternalId from "@calcom/app-store/_utils/calendars/processExternalId";
import { getPaymentAppData } from "@calcom/app-store/_utils/payments/getPaymentAppData";
import { metadata as GoogleMeetMetadata } from "@calcom/app-store/googlevideo/_metadata";
import {
  getLocationValueForDB,
  MeetLocationType,
  OrganizerDefaultConferencingAppType,
} from "@calcom/app-store/locations";
import { getAppFromSlug } from "@calcom/app-store/utils";
import {
  eventTypeAppMetadataOptionalSchema,
  eventTypeMetaDataSchemaWithTypedApps,
} from "@calcom/app-store/zod-utils";
import dayjs from "@calcom/dayjs";
import getICalUID from "@calcom/emails/lib/getICalUID";
import { verifyCodeUnAuthenticated } from "@calcom/features/auth/lib/verifyCodeUnAuthenticated";
import type {
  BookingDataSchemaGetter,
  BookingHandlerInput,
  CreateBookingMeta,
  CreateRegularBookingData,
} from "@calcom/features/bookings/lib/dto/types";
import EventManager, { placeholderCreatedEvent } from "@calcom/features/bookings/lib/EventManager";
import { getAssignmentReasonCategory } from "@calcom/features/bookings/lib/getAssignmentReasonCategory";
import type { CheckBookingAndDurationLimitsService } from "@calcom/features/bookings/lib/handleNewBooking/checkBookingAndDurationLimits";
import { handlePayment } from "@calcom/features/bookings/lib/handlePayment";
import { handleWebhookTrigger } from "@calcom/features/bookings/lib/handleWebhookTrigger";
import { isEventTypeLoggingEnabled } from "@calcom/features/bookings/lib/isEventTypeLoggingEnabled";
import type { BookingEmailAndSmsTasker } from "@calcom/features/bookings/lib/tasker/BookingEmailAndSmsTasker";
import type { BuiltCalendarEvent } from "@calcom/features/CalendarEventBuilder";
import { CalendarEventBuilder } from "@calcom/features/CalendarEventBuilder";
import { getSpamCheckService } from "@calcom/features/di/watchlist/containers/SpamCheckService.container";
import {
  type EventTypeBrandingData,
  getEventTypeService,
} from "@calcom/features/eventtypes/di/EventTypeService.container";
import { getUsernameList } from "@calcom/features/eventtypes/lib/defaultEvents";
import { getEventName, updateHostInEventName } from "@calcom/features/eventtypes/lib/eventNaming";
import { getFullName } from "@calcom/features/form-builder/utils";
import type { HashedLinkService } from "@calcom/features/hashedLink/lib/service/HashedLinkService";
import { ProfileRepository } from "@calcom/features/profile/repositories/ProfileRepository";
import { handleAnalyticsEvents } from "@calcom/features/tasker/tasks/analytics/handleAnalyticsEvents";
import type { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import { UsersRepository } from "@calcom/features/users/users.repository";
import type { GetSubscriberOptions } from "@calcom/features/webhooks/lib/getWebhooks";
import getWebhooks from "@calcom/features/webhooks/lib/getWebhooks";
import type { IWebhookProducerService } from "@calcom/features/webhooks/lib/interface/WebhookProducerService";
import {
  cancelNoShowTasksForBooking,
  deleteWebhookScheduledTriggers,
  scheduleTrigger,
} from "@calcom/features/webhooks/lib/scheduleTrigger";
import type { EventPayloadType, EventTypeInfo } from "@calcom/features/webhooks/lib/sendPayload";
import { getTranslation } from "@calcom/i18n/server";
import { groupHostsByGroupId } from "@calcom/lib/bookings/hostGroupUtils";
import { shouldIgnoreContactOwner } from "@calcom/lib/bookings/routing/utils";
import { getVideoCallUrlFromCalEvent } from "@calcom/lib/CalEventParser";
import { DEFAULT_GROUP_ID, ENABLE_ASYNC_TASKER } from "@calcom/lib/constants";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { extractBaseEmail } from "@calcom/lib/extract-base-email";
import { HttpError } from "@calcom/lib/http-error";
import { criticalLogger } from "@calcom/lib/logger.server";
import { getPiiFreeCalendarEvent, getPiiFreeEventType } from "@calcom/lib/piiFreeData";
import { safeStringify } from "@calcom/lib/safeStringify";
import { getServerErrorFromUnknown } from "@calcom/lib/server/getServerErrorFromUnknown";
import { getTimeFormatStringFromUserTimeFormat } from "@calcom/lib/timeFormat";
import { distributedTracing } from "@calcom/lib/tracing/factory";
import type { PrismaClient } from "@calcom/prisma";
import type { AssignmentReasonEnum, DestinationCalendar, Prisma, User } from "@calcom/prisma/client";
import { BookingStatus, CreationSource, SchedulingType, WebhookTriggerEvents } from "@calcom/prisma/enums";
import { userMetadata as userMetadataSchema } from "@calcom/prisma/zod-utils";
import type {
  AdditionalInformation,
  AppsStatus,
  CalEventResponses,
  CalendarEvent,
} from "@calcom/types/Calendar";
import type { CredentialForCalendarService } from "@calcom/types/Credential";
import type { EventResult, PartialReference } from "@calcom/types/EventManager";
import short, { uuid } from "short-uuid";
import { v5 as uuidv5 } from "uuid";
import type { BookingRepository } from "../../repositories/BookingRepository";
import { BookingActionMap, type BookingActionType, BookingEmailSmsHandler } from "../BookingEmailSmsHandler";
import { getAllCredentialsIncludeServiceAccountKey } from "../getAllCredentialsForUsersOnEvent/getAllCredentials";
import { refreshCredentials } from "../getAllCredentialsForUsersOnEvent/refreshCredentials";
import getBookingDataSchema from "../getBookingDataSchema";
import type { LuckyUserService } from "../getLuckyUser";
import { checkActiveBookingsLimitForBooker } from "../handleNewBooking/checkActiveBookingsLimitForBooker";
import { checkIfBookerEmailIsBlocked } from "../handleNewBooking/checkIfBookerEmailIsBlocked";
import type { Booking } from "../handleNewBooking/createBooking";
import { createBooking } from "../handleNewBooking/createBooking";
import { ensureAvailableUsers } from "../handleNewBooking/ensureAvailableUsers";
import { getBookingData } from "../handleNewBooking/getBookingData";
import { getCustomInputsResponses } from "../handleNewBooking/getCustomInputsResponses";
import { getEventType } from "../handleNewBooking/getEventType";
import type { getEventTypeResponse } from "../handleNewBooking/getEventTypesFromDB";
import { getLocationValuesForDb } from "../handleNewBooking/getLocationValuesForDb";
import { getRequiresConfirmationFlags } from "../handleNewBooking/getRequiresConfirmationFlags";
import { getSeatedBooking } from "../handleNewBooking/getSeatedBooking";
import { getVideoCallDetails } from "../handleNewBooking/getVideoCallDetails";
import { handleAppsStatus } from "../handleNewBooking/handleAppsStatus";
import { loadAndValidateUsers } from "../handleNewBooking/loadAndValidateUsers";
import type { BookingType } from "../handleNewBooking/originalRescheduledBookingUtils";
import { getOriginalRescheduledBooking } from "../handleNewBooking/originalRescheduledBookingUtils";
import { scheduleNoShowTriggers } from "../handleNewBooking/scheduleNoShowTriggers";
import type { IEventTypePaymentCredentialType, Invitee, IsFixedAwareUser } from "../handleNewBooking/types";
import { validateBookingTimeIsNotOutOfBounds } from "../handleNewBooking/validateBookingTimeIsNotOutOfBounds";
import { validateEventLength } from "../handleNewBooking/validateEventLength";
import handleSeats from "../handleSeats/handleSeats";
import type { IBookingService } from "../interfaces/IBookingService";
import type { BookingEventHandlerService } from "../onBookingEvents/BookingEventHandlerService";
import type { BookingRescheduledPayload } from "../onBookingEvents/types";
import { isWithinMinimumRescheduleNotice } from "../reschedule/isWithinMinimumRescheduleNotice";

const translator = short();

type IsFixedAwareUserWithCredentials = Omit<IsFixedAwareUser, "credentials"> & {
  credentials: CredentialForCalendarService[];
};

function assertNonEmptyArray<T>(arr: T[]): asserts arr is [T, ...T[]] {
  if (arr.length === 0) {
    throw new Error("Array should have at least one item, but it's empty");
  }
}

function getICalSequence(originalRescheduledBooking: BookingType | null) {
  // If new booking set the sequence to 0
  if (!originalRescheduledBooking) {
    return 0;
  }

  // If rescheduling and there is no sequence set, assume sequence should be 1
  if (!originalRescheduledBooking.iCalSequence) {
    return 1;
  }

  // If rescheduling then increment sequence by 1
  return originalRescheduledBooking.iCalSequence + 1;
}

type CreatedBooking = Booking & {
  isShortCircuitedBooking?: boolean;
} & { appsStatus?: AppsStatus[]; paymentUid?: string; paymentId?: number };
type ReturnTypeCreateBooking = Awaited<ReturnType<typeof createBooking>>;
export const buildDryRunBooking = ({
  eventTypeId,
  organizerUser,
  eventName,
  startTime,
  endTime,
  contactOwnerFromReq,
  contactOwnerEmail,
  allHostUsers,
  isManagedEventType,
}: {
  eventTypeId: number;
  organizerUser: {
    id: number;
    uuid: string;
    name: string | null;
    username: string | null;
    email: string;
    timeZone: string;
    isPlatformManaged?: boolean;
  };
  eventName: string;
  startTime: string;
  endTime: string;
  contactOwnerFromReq: string | null;
  contactOwnerEmail: string | null;
  allHostUsers: { id: number }[];
  isManagedEventType: boolean;
}) => {
  const sanitizedOrganizerUser = {
    id: organizerUser.id,
    uuid: organizerUser.uuid,
    name: organizerUser.name,
    username: organizerUser.username,
    email: organizerUser.email,
    timeZone: organizerUser.timeZone,
    isPlatformManaged: organizerUser.isPlatformManaged ?? false,
  };
  const booking = {
    id: -101,
    uid: "DRY_RUN_UID",
    iCalUID: "DRY_RUN_ICAL_UID",
    status: BookingStatus.ACCEPTED,
    eventTypeId: eventTypeId,
    user: sanitizedOrganizerUser,
    userId: sanitizedOrganizerUser.id,
    userUuid: sanitizedOrganizerUser.uuid,
    title: eventName,
    startTime: new Date(startTime),
    endTime: new Date(endTime),
    createdAt: new Date(),
    updatedAt: new Date(),
    attendees: [],
    oneTimePassword: null,
    smsReminderNumber: null,
    metadata: {},
    idempotencyKey: null,
    userPrimaryEmail: null,
    description: null,
    customInputs: null,
    responses: null,
    location: null,
    paid: false,
    cancellationReason: null,
    rejectionReason: null,
    dynamicEventSlugRef: null,
    dynamicGroupSlugRef: null,
    fromReschedule: null,
    recurringEventId: null,
    scheduledJobs: [],
    rescheduledBy: null,
    destinationCalendarId: null,
    reassignReason: null,
    reassignById: null,
    rescheduled: false,
    isRecorded: false,
    iCalSequence: 0,
    rating: null,
    ratingFeedback: null,
    noShowHost: null,
    cancelledBy: null,
    creationSource: CreationSource.WEBAPP,
    references: [],
    payment: [],
  } satisfies ReturnTypeCreateBooking;

  /**
   * Troubleshooting data
   */
  const troubleshooterData = {
    organizerUserId: organizerUser.id,
    eventTypeId,
    askedContactOwnerEmail: contactOwnerFromReq,
    usedContactOwnerEmail: contactOwnerEmail,
    allHostUsers: allHostUsers.map((user) => user.id),
    isManagedEventType: isManagedEventType,
  };

  return {
    booking,
    troubleshooterData,
  };
};

const buildDryRunEventManager = () => {
  return {
    create: async () => ({ results: [], referencesToCreate: [] }),
    reschedule: async () => ({ results: [], referencesToCreate: [] }),
  };
};

type TeamMember = {
  id: number;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  timeZone: string;
  language: { translate: Awaited<ReturnType<typeof getTranslation>>; locale: string };
};

export async function computeTeamData({
  isTeamEventType,
  schedulingType,
  users,
  organizerEmail,
}: {
  isTeamEventType: boolean;
  schedulingType: SchedulingType | null;
  users: (Pick<User, "id" | "name" | "timeZone" | "locale" | "email"> & {
    destinationCalendar: DestinationCalendar | null;
    isFixed?: boolean;
  })[];
  organizerEmail: string;
}): Promise<{ teamMembers: TeamMember[]; teamDestinationCalendars: DestinationCalendar[] }> {
  if (!isTeamEventType || !schedulingType) {
    return { teamMembers: [], teamDestinationCalendars: [] };
  }

  const teamDestinationCalendars: DestinationCalendar[] = [];
  const fixedUsers = users.filter((user) => user.isFixed);
  const nonFixedUsers = users.filter((user) => !user.isFixed);
  const filteredUsers =
    schedulingType === SchedulingType.ROUND_ROBIN ? [...fixedUsers, ...nonFixedUsers] : users;

  // Organizer or user owner of this event type it's not listed as a team member.
  const teamMemberPromises = filteredUsers
    .filter((user) => user.email !== organizerEmail)
    .map(async (user) => {
      // push to teamDestinationCalendars if it's a team event but collective only
      if (schedulingType === "COLLECTIVE" && user.destinationCalendar) {
        teamDestinationCalendars.push({
          ...user.destinationCalendar,
          externalId: processExternalId(user.destinationCalendar),
        });
      }
      return {
        id: user.id,
        email: user.email ?? "",
        name: user.name ?? "",
        firstName: "",
        lastName: "",
        timeZone: user.timeZone,
        language: {
          translate: await getTranslation(user.locale ?? "en", "common"),
          locale: user.locale ?? "en",
        },
      };
    });

  const teamMembers = await Promise.all(teamMemberPromises);
  return { teamMembers, teamDestinationCalendars };
}

function buildTroubleshooterData({
  eventType,
}: {
  eventType: {
    id: number;
    slug: string;
  };
}) {
  const troubleshooterData: {
    organizerUser: {
      id: number;
    } | null;
    eventType: {
      id: number;
      slug: string;
    };
    allHostUsers: number[];
    luckyUsers: number[];
    luckyUserPool: number[];
    fixedUsers: number[];
    luckyUsersFromFirstBooking: number[];
    usedContactOwnerEmail: string | null;
    askedContactOwnerEmail: string | null;
    isManagedEventType: boolean;
  } = {
    organizerUser: null,
    eventType: {
      id: eventType.id,
      slug: eventType.slug,
    },
    luckyUsers: [],
    luckyUserPool: [],
    fixedUsers: [],
    luckyUsersFromFirstBooking: [],
    usedContactOwnerEmail: null,
    allHostUsers: [],
    askedContactOwnerEmail: null,
    isManagedEventType: false,
  };
  return troubleshooterData;
}

function formatAvailabilitySnapshot(data: {
  dateRanges: { start: dayjs.Dayjs; end: dayjs.Dayjs }[];
  oooExcludedDateRanges: { start: dayjs.Dayjs; end: dayjs.Dayjs }[];
}) {
  return {
    ...data,
    dateRanges: data.dateRanges.map(({ start, end }) => ({
      start: start.toISOString(),
      end: end.toISOString(),
    })),
    oooExcludedDateRanges: data.oooExcludedDateRanges.map(({ start, end }) => ({
      start: start.toISOString(),
      end: end.toISOString(),
    })),
  };
}

function buildBookingCreatedPayload({
  booking,
  organizerUserId,
  organizerUserUuid,
  hashedLink,
  isDryRun,
}: {
  booking: {
    id: number;
    uid: string;
    startTime: Date;
    endTime: Date;
    status: BookingStatus;
    userId: number | null;
  };
  organizerUserId: number;
  organizerUserUuid: string | null;
  hashedLink: string | null;
  isDryRun: boolean;
}) {
  return {
    config: {
      isDryRun,
    },
    bookingFormData: {
      hashedLink,
    },
    booking: {
      id: booking.id,
      uid: booking.uid,
      startTime: booking.startTime,
      endTime: booking.endTime,
      status: booking.status,
      userId: booking.userId,
      userUuid: organizerUserUuid,
      user: {
        id: organizerUserId,
      },
    },
  };
}

export interface IBookingServiceDependencies {
  checkBookingAndDurationLimitsService: CheckBookingAndDurationLimitsService;
  prismaClient: PrismaClient;
  bookingRepository: BookingRepository;
  luckyUserService: LuckyUserService;
  userRepository: UserRepository;
  hashedLinkService: HashedLinkService;
  bookingEmailAndSmsTasker: BookingEmailAndSmsTasker;
  bookingEventHandler: BookingEventHandlerService;
  webhookProducer: IWebhookProducerService;
}

async function validateRescheduleRestrictions({
  rescheduleUid,
  userId,
  eventType,
}: {
  rescheduleUid: string | null | undefined;
  userId: number | null;
  eventType: { seatsPerTimeSlot: number | null; minimumRescheduleNotice: number | null } | null;
}): Promise<void> {
  if (!rescheduleUid || !eventType) {
    return; // Not a reschedule, skip validation
  }

  const bookingSeat = rescheduleUid ? await getSeatedBooking(rescheduleUid) : null;
  const actualRescheduleUid = bookingSeat ? bookingSeat.booking.uid : rescheduleUid;

  if (!actualRescheduleUid) {
    return; // No valid reschedule UID
  }

  try {
    const originalRescheduledBooking = await getOriginalRescheduledBooking(
      actualRescheduleUid,
      !!eventType.seatsPerTimeSlot
    );

    // Check if user is the organizer
    const isUserOrganizer =
      userId && originalRescheduledBooking.userId && userId === originalRescheduledBooking.userId;

    // Check minimum reschedule notice (only for non-organizers)
    const { minimumRescheduleNotice } = originalRescheduledBooking.eventType || {};
    if (
      !isUserOrganizer &&
      isWithinMinimumRescheduleNotice(originalRescheduledBooking.startTime, minimumRescheduleNotice ?? null)
    ) {
      throw new HttpError({
        statusCode: 403,
        message: "Rescheduling is not allowed within the minimum notice period before the event",
      });
    }
  } catch (error) {
    // Re-throw HttpError (including our 403 validation error)
    if (error instanceof HttpError) {
      throw error;
    }
    // For other errors (like booking not found), let the service handle it later
    // We don't want to fail early validation for these cases
  }
}

async function handler(
  this: RegularBookingService,
  input: BookingHandlerInput,
  deps: IBookingServiceDependencies,
  bookingDataSchemaGetter: BookingDataSchemaGetter = getBookingDataSchema
) {
  const {
    bookingData: rawBookingData,
    userId,
    userUuid,
    platformClientId,
    platformCancelUrl,
    platformBookingUrl,
    platformRescheduleUrl,
    platformBookingLocation,
    hostname,
    forcedSlug,
    areCalendarEventsEnabled = true,
    skipAvailabilityCheck = false,
    skipEventLimitsCheck = false,
    skipCalendarSyncTaskCreation = false,
    traceContext: passedTraceContext,
  } = input;
  let bookingEmailsAndSmsTaskerAction: BookingActionType = BookingActionMap.requested;

  const traceContext = passedTraceContext
    ? passedTraceContext
    : distributedTracing.createTrace("booking_creation");

  const tracingLogger = distributedTracing.getTracingLogger(traceContext, {
    eventTypeId: rawBookingData.eventTypeId,
    userId: userId,
    eventTypeSlug: rawBookingData.eventTypeSlug,
  });

  const isPlatformBooking = !!platformClientId;

  const eventType = await getEventType({
    eventTypeId: rawBookingData.eventTypeId,
    eventTypeSlug: rawBookingData.eventTypeSlug,
  });

  // Early validation: Check reschedule restrictions if rescheduling
  await validateRescheduleRestrictions({
    rescheduleUid: rawBookingData.rescheduleUid,
    userId: userId ?? null,
    eventType: eventType
      ? {
          seatsPerTimeSlot: eventType.seatsPerTimeSlot,
          minimumRescheduleNotice: eventType.minimumRescheduleNotice ?? null,
        }
      : null,
  });

  const bookingDataSchema = bookingDataSchemaGetter({
    view: rawBookingData.rescheduleUid ? "reschedule" : "booking",
    bookingFields: eventType.bookingFields,
  });

  const bookingData = await getBookingData({
    reqBody: rawBookingData,
    eventType,
    schema: bookingDataSchema,
  });

  const {
    recurringCount,
    noEmail,
    eventTypeId,
    eventTypeSlug,
    hasHashedBookingLink,
    language,
    appsStatus: reqAppsStatus,
    name: bookerName,
    attendeePhoneNumber: bookerPhoneNumber,
    email: bookerEmail,
    guests: reqGuests,
    location,
    notes: additionalNotes,
    smsReminderNumber,
    rescheduleReason,
    luckyUsers,
    routedTeamMemberIds,
    rrHostSubsetIds,
    _isDryRun: isDryRun = false,
    ...reqBody
  } = bookingData;

  let troubleshooterData = buildTroubleshooterData({
    eventType,
  });

  const emailsAndSmsHandler = new BookingEmailSmsHandler({ logger: tracingLogger });

  try {
    await checkIfBookerEmailIsBlocked({
      loggedInUserId: userId,
      bookerEmail,
      verificationCode: reqBody.verificationCode,
      isReschedule: !!rawBookingData.rescheduleUid,
    });
  } catch (error) {
    if (error instanceof ErrorWithCode) {
      throw new HttpError({ statusCode: 403, message: error.message });
    }
    throw error;
  }

  const spamCheckService = getSpamCheckService();

  const eventTypeOrganizationId =
    eventType.team?.parentId ??
    eventType.parent?.team?.parentId ??
    eventType.owner?.profiles?.[0]?.organizationId ??
    null;
  spamCheckService.startCheck({ email: bookerEmail, organizationId: eventTypeOrganizationId });

  if (!rawBookingData.rescheduleUid) {
    await checkActiveBookingsLimitForBooker({
      eventTypeId,
      maxActiveBookingsPerBooker: eventType.maxActiveBookingsPerBooker,
      bookerEmail,
      offerToRescheduleLastBooking: eventType.maxActiveBookingPerBookerOfferReschedule,
    });
  }

  if (eventType.requiresBookerEmailVerification && !rawBookingData.rescheduleUid) {
    const verificationCode = reqBody.verificationCode;
    if (!verificationCode) {
      throw new HttpError({
        statusCode: 400,
        message: "email_verification_required",
      });
    }

    try {
      await verifyCodeUnAuthenticated(bookerEmail, verificationCode);
    } catch {
      throw new HttpError({
        statusCode: 400,
        message: "invalid_verification_code",
      });
    }
  }

  if (isEventTypeLoggingEnabled({ eventTypeId, usernameOrTeamName: reqBody.user })) {
    tracingLogger.settings.minLevel = 0;
  }

  const fullName = getFullName(bookerName);
  // Why are we only using "en" locale
  const tGuests = await getTranslation("en", "common");

  const dynamicUserList = Array.isArray(reqBody.user) ? reqBody.user : getUsernameList(reqBody.user);
  if (!eventType)
    throw new HttpError({
      statusCode: 404,
      message: "event_type_not_found",
    });

  if (eventType.seatsPerTimeSlot && eventType.recurringEvent) {
    throw new HttpError({
      statusCode: 400,
      message: "recurring_event_seats_error",
    });
  }

  const bookingSeat = reqBody.rescheduleUid ? await getSeatedBooking(reqBody.rescheduleUid) : null;
  const rescheduleUid = bookingSeat ? bookingSeat.booking.uid : reqBody.rescheduleUid;
  const isNormalBookingOrFirstRecurringSlot = input.bookingData.allRecurringDates
    ? !!input.bookingData.isFirstRecurringSlot
    : true;

  let originalRescheduledBooking = rescheduleUid
    ? await getOriginalRescheduledBooking(rescheduleUid, !!eventType.seatsPerTimeSlot)
    : null;

  const paymentAppData = getPaymentAppData({
    ...eventType,
    metadata: eventTypeMetaDataSchemaWithTypedApps.parse(eventType.metadata),
  });

  const { userReschedulingIsOwner, isConfirmedByDefault } = await getRequiresConfirmationFlags({
    eventType,
    bookingStartTime: reqBody.start,
    userId,
    originalRescheduledBookingOrganizerId: originalRescheduledBooking?.user?.id,
    paymentAppData,
    bookerEmail,
  });

  // For unconfirmed bookings or round robin bookings with the same attendee and timeslot, return the original booking
  if (
    (!isConfirmedByDefault && !userReschedulingIsOwner) ||
    eventType.schedulingType === SchedulingType.ROUND_ROBIN
  ) {
    const requiresPayment = !Number.isNaN(paymentAppData.price) && paymentAppData.price > 0;

    const existingBooking = await deps.bookingRepository.getValidBookingFromEventTypeForAttendee({
      eventTypeId,
      bookerEmail,
      bookerPhoneNumber,
      startTime: new Date(dayjs(reqBody.start).utc().format()),
      filterForUnconfirmed: !isConfirmedByDefault,
    });

    if (existingBooking) {
      const hasPayments = existingBooking.payment.length > 0;
      const isPaidBooking = existingBooking.paid || !hasPayments;

      const shouldShowPaymentForm = requiresPayment && !isPaidBooking;

      const firstPayment = shouldShowPaymentForm ? existingBooking.payment[0] : undefined;

      const bookingResponse = {
        ...existingBooking,
        user: {
          ...existingBooking.user,
          email: null,
        },
        paymentRequired: shouldShowPaymentForm,
        seatReferenceUid: "",
      };

      return {
        ...bookingResponse,
        luckyUsers: bookingResponse.userId ? [bookingResponse.userId] : [],
        isDryRun,
        ...(isDryRun ? { troubleshooterData } : {}),
        paymentUid: firstPayment?.uid,
        paymentId: firstPayment?.id,
        previousBooking: originalRescheduledBooking
          ? {
              uid: originalRescheduledBooking.uid,
              startTime: originalRescheduledBooking.startTime,
              endTime: originalRescheduledBooking.endTime,
            }
          : null,
      };
    }
  }

  const isTeamEventType =
    !!eventType.schedulingType && ["COLLECTIVE", "ROUND_ROBIN"].includes(eventType.schedulingType);

  // Use "booking" mode to bypass cache for booking confirmation
  const calendarFetchMode = "booking" as const;

  tracingLogger.info(
    `Booking eventType ${eventTypeId} started`,
    safeStringify({
      reqBody: {
        user: reqBody.user,
        eventTypeId,
        eventTypeSlug,
        startTime: reqBody.start,
        endTime: reqBody.end,
        rescheduleUid: reqBody.rescheduleUid,
        location: location,
        timeZone: reqBody.timeZone,
      },
      isTeamEventType,
      eventType: getPiiFreeEventType(eventType),
      dynamicUserList,
      paymentAppData: {
        enabled: paymentAppData.enabled,
        price: paymentAppData.price,
        paymentOption: paymentAppData.paymentOption,
        currency: paymentAppData.currency,
        appId: paymentAppData.appId,
      },
    })
  );

  const user = eventType.users.find((user) => user.id === eventType.userId);
  const userSchedule = user?.schedules.find((schedule) => schedule.id === user?.defaultScheduleId);
  const eventTimeZone = eventType.schedule?.timeZone ?? userSchedule?.timeZone;

  await validateBookingTimeIsNotOutOfBounds<typeof eventType>(
    reqBody.start,
    reqBody.timeZone,
    eventType,
    eventTimeZone,
    tracingLogger
  );

  validateEventLength({
    reqBodyStart: reqBody.start,
    reqBodyEnd: reqBody.end,
    eventTypeMultipleDuration: eventType.metadata?.multipleDuration,
    eventTypeLength: eventType.length,
    logger: tracingLogger,
  });

  const contactOwnerFromReq = reqBody.teamMemberEmail ?? null;

  const skipContactOwner = shouldIgnoreContactOwner({
    skipContactOwner: reqBody.skipContactOwner ?? null,
    rescheduleUid: reqBody.rescheduleUid ?? null,
    routedTeamMemberIds: routedTeamMemberIds ?? null,
  });

  const contactOwnerEmail = skipContactOwner ? null : contactOwnerFromReq;
  const _crmRecordId: string | undefined = reqBody.crmRecordId ?? undefined;

  const { qualifiedRRUsers, additionalFallbackRRUsers, fixedUsers } = await loadAndValidateUsers({
    hostname,
    forcedSlug,
    isPlatform: isPlatformBooking,
    eventType,
    eventTypeId,
    dynamicUserList,
    logger: tracingLogger,
    routedTeamMemberIds: routedTeamMemberIds ?? null,
    contactOwnerEmail,
    rescheduleUid: reqBody.rescheduleUid || null,
    rrHostSubsetIds: rrHostSubsetIds ?? undefined,
  });

  // We filter out users but ensure allHostUsers remain same.
  let users = [...qualifiedRRUsers, ...additionalFallbackRRUsers, ...fixedUsers];

  const firstUser = users[0];

  let { locationBodyString, organizerOrFirstDynamicGroupMemberDefaultLocationUrl } = getLocationValuesForDb({
    dynamicUserList,
    users,
    location,
  });

  if (!skipEventLimitsCheck) {
    await deps.checkBookingAndDurationLimitsService.checkBookingAndDurationLimits({
      eventType,
      reqBodyStart: reqBody.start,
      reqBodyRescheduleUid: reqBody.rescheduleUid,
    });
  }

  let luckyUserResponse;
  let isFirstSeat = true;
  let availableUsers: IsFixedAwareUser[] = [];

  if (eventType.seatsPerTimeSlot) {
    const booking = await deps.prismaClient.booking.findFirst({
      where: {
        eventTypeId: eventType.id,
        startTime: new Date(dayjs(reqBody.start).utc().format()),
        status: BookingStatus.ACCEPTED,
      },
      select: {
        userId: true,
        attendees: { select: { email: true } },
      },
    });

    if (booking) {
      isFirstSeat = false;
      if (eventType.schedulingType === SchedulingType.ROUND_ROBIN) {
        const fixedHosts = users.filter((user) => user.isFixed);
        const originalNonFixedHost = users.find((user) => !user.isFixed && user.id === booking.userId);

        if (originalNonFixedHost) {
          users = [...fixedHosts, originalNonFixedHost];
        } else {
          const attendeeEmailSet = new Set(booking.attendees.map((attendee) => attendee.email));

          // In this case, the first booking user is a fixed host, so the chosen non-fixed host is added as an attendee of the booking
          const nonFixedAttendeeHost = users.find(
            (user) => !user.isFixed && attendeeEmailSet.has(user.email)
          );
          users = [...fixedHosts, ...(nonFixedAttendeeHost ? [nonFixedAttendeeHost] : [])];
        }
      }
    }
  }

  //checks what users are available
  if (isFirstSeat) {
    const eventTypeWithUsers: Omit<getEventTypeResponse, "users"> & {
      users: IsFixedAwareUserWithCredentials[];
    } = {
      ...eventType,
      minimumRescheduleNotice: eventType.minimumRescheduleNotice ?? null,
      users: users as IsFixedAwareUserWithCredentials[],
      ...(eventType.recurringEvent && {
        recurringEvent: {
          ...eventType.recurringEvent,
          count: recurringCount || eventType.recurringEvent.count,
        },
      }),
    };
    if (
      input.bookingData.allRecurringDates &&
      input.bookingData.isFirstRecurringSlot &&
      input.bookingData.numSlotsToCheckForAvailability
    ) {
      const isTeamEvent =
        eventType.schedulingType === SchedulingType.COLLECTIVE ||
        eventType.schedulingType === SchedulingType.ROUND_ROBIN;

      const fixedUsers = isTeamEvent
        ? eventTypeWithUsers.users.filter((user: IsFixedAwareUserWithCredentials) => user.isFixed)
        : [];

      for (
        let i = 0;
        i < input.bookingData.allRecurringDates.length &&
        i < input.bookingData.numSlotsToCheckForAvailability;
        i++
      ) {
        const start = input.bookingData.allRecurringDates[i].start;
        const end = input.bookingData.allRecurringDates[i].end;
        if (isTeamEvent) {
          // each fixed user must be available
          for (const key in fixedUsers) {
            if (!skipAvailabilityCheck) {
              await ensureAvailableUsers(
                { ...eventTypeWithUsers, users: [fixedUsers[key]] },
                {
                  dateFrom: dayjs(start).tz(reqBody.timeZone).format(),
                  dateTo: dayjs(end).tz(reqBody.timeZone).format(),
                  timeZone: reqBody.timeZone,
                  originalRescheduledBooking: originalRescheduledBooking ?? null,
                },
                tracingLogger,
                calendarFetchMode
              );
            }
          }
        } else {
          if (!skipAvailabilityCheck) {
            await ensureAvailableUsers(
              eventTypeWithUsers,
              {
                dateFrom: dayjs(start).tz(reqBody.timeZone).format(),
                dateTo: dayjs(end).tz(reqBody.timeZone).format(),
                timeZone: reqBody.timeZone,
                originalRescheduledBooking,
              },
              tracingLogger,
              calendarFetchMode
            );
          }
        }
      }
    }

    if (!input.bookingData.allRecurringDates || input.bookingData.isFirstRecurringSlot) {
      try {
        if (!skipAvailabilityCheck) {
          availableUsers = await ensureAvailableUsers(
            { ...eventTypeWithUsers, users: [...qualifiedRRUsers, ...fixedUsers] as IsFixedAwareUser[] },
            {
              dateFrom: dayjs(reqBody.start).tz(reqBody.timeZone).format(),
              dateTo: dayjs(reqBody.end).tz(reqBody.timeZone).format(),
              timeZone: reqBody.timeZone,
              originalRescheduledBooking,
            },
            tracingLogger,
            calendarFetchMode
          );
        } else {
          availableUsers = [...qualifiedRRUsers, ...fixedUsers] as IsFixedAwareUser[];
        }
      } catch {
        if (additionalFallbackRRUsers.length) {
          tracingLogger.debug(
            "Qualified users not available, check for fallback users",
            safeStringify({
              qualifiedRRUsers: qualifiedRRUsers.map((user) => user.id),
              additionalFallbackRRUsers: additionalFallbackRRUsers.map((user) => user.id),
            })
          );
          // can happen when contact owner not available for 2 weeks or fairness would block at least 2 weeks
          // use fallback instead
          if (!skipAvailabilityCheck) {
            availableUsers = await ensureAvailableUsers(
              {
                ...eventTypeWithUsers,
                users: [...additionalFallbackRRUsers, ...fixedUsers] as IsFixedAwareUser[],
              },
              {
                dateFrom: dayjs(reqBody.start).tz(reqBody.timeZone).format(),
                dateTo: dayjs(reqBody.end).tz(reqBody.timeZone).format(),
                timeZone: reqBody.timeZone,
                originalRescheduledBooking,
              },
              tracingLogger,
              calendarFetchMode
            );
          } else {
            availableUsers = [...additionalFallbackRRUsers, ...fixedUsers] as IsFixedAwareUser[];
          }
        } else {
          tracingLogger.debug(
            "Qualified users not available, no fallback users",
            safeStringify({
              qualifiedRRUsers: qualifiedRRUsers.map((user) => user.id),
            })
          );
          throw new Error(ErrorCode.NoAvailableUsersFound);
        }
      }

      const fixedUserPool: IsFixedAwareUser[] = [];
      const nonFixedUsers: IsFixedAwareUser[] = [];

      availableUsers.forEach((user) => {
        if (user.isFixed) {
          fixedUserPool.push(user);
        } else {
          nonFixedUsers.push(user);
        }
      });

      // Group non-fixed users by their group IDs
      const luckyUserPools = groupHostsByGroupId({
        hosts: nonFixedUsers,
        hostGroups: eventType.hostGroups,
      });

      const notAvailableLuckyUsers: typeof users = [];

      tracingLogger.debug(
        "Computed available users",
        safeStringify({
          availableUsers: availableUsers.map((user) => user.id),
          luckyUserPools: Object.fromEntries(
            Object.entries(luckyUserPools).map(([groupId, users]) => [groupId, users.map((user) => user.id)])
          ),
        })
      );

      const luckyUsers: typeof users = [];
      // loop through all non-fixed hosts and get the lucky users
      // This logic doesn't run when contactOwner is used because in that case, luckUsers.length === 1
      for (const [groupId, luckyUserPool] of Object.entries(luckyUserPools)) {
        let luckUserFound = false;
        while (luckyUserPool.length > 0 && !luckUserFound) {
          const freeUsers = luckyUserPool.filter(
            (user) => !luckyUsers.concat(notAvailableLuckyUsers).find((existing) => existing.id === user.id)
          );
          // no more freeUsers after subtracting notAvailableLuckyUsers from luckyUsers :(
          if (freeUsers.length === 0) break;
          assertNonEmptyArray(freeUsers); // make sure TypeScript knows it too with an assertion; the error will never be thrown.
          // freeUsers is ensured

          const userIdsSet = new Set(users.map((user) => user.id));
          const newLuckyUser = await deps.luckyUserService.getLuckyUser({
            availableUsers: freeUsers,
            allRRHosts: eventTypeWithUsers.hosts.filter(
              (host) =>
                !host.isFixed &&
                userIdsSet.has(host.user.id) &&
                (host.groupId === groupId || (!host.groupId && groupId === DEFAULT_GROUP_ID))
            ),
            eventType,
            meetingStartTime: new Date(reqBody.start),
          });
          if (!newLuckyUser) {
            break; // prevent infinite loop
          }
          if (
            input.bookingData.isFirstRecurringSlot &&
            eventType.schedulingType === SchedulingType.ROUND_ROBIN &&
            input.bookingData.numSlotsToCheckForAvailability &&
            input.bookingData.allRecurringDates
          ) {
            // for recurring round robin events check if lucky user is available for next slots
            try {
              for (
                let i = 0;
                i < input.bookingData.allRecurringDates.length &&
                i < input.bookingData.numSlotsToCheckForAvailability;
                i++
              ) {
                const start = input.bookingData.allRecurringDates[i].start;
                const end = input.bookingData.allRecurringDates[i].end;

                if (!skipAvailabilityCheck) {
                  await ensureAvailableUsers(
                    { ...eventTypeWithUsers, users: [newLuckyUser] },
                    {
                      dateFrom: dayjs(start).tz(reqBody.timeZone).format(),
                      dateTo: dayjs(end).tz(reqBody.timeZone).format(),
                      timeZone: reqBody.timeZone,
                      originalRescheduledBooking,
                    },
                    tracingLogger,
                    calendarFetchMode
                  );
                }
              }
              // if no error, then lucky user is available for the next slots
              luckyUsers.push(newLuckyUser);
              luckUserFound = true;
            } catch {
              notAvailableLuckyUsers.push(newLuckyUser);
              tracingLogger.info(
                `Round robin host ${newLuckyUser.name} not available for first two slots. Trying to find another host.`
              );
            }
          } else {
            luckyUsers.push(newLuckyUser);
            luckUserFound = true;
          }
        }
      }

      // ALL fixed users must be available
      if (fixedUserPool.length !== users.filter((user) => user.isFixed).length) {
        throw new Error(ErrorCode.FixedHostsUnavailableForBooking);
      }

      const roundRobinHosts = eventType.hosts.filter((host) => !host.isFixed);

      const hostGroups = groupHostsByGroupId({
        hosts: roundRobinHosts,
        hostGroups: eventType.hostGroups,
      });

      // Filter out host groups that have no hosts in them
      const nonEmptyHostGroups = Object.fromEntries(
        Object.entries(hostGroups).filter(([, hosts]) => hosts.length > 0)
      );
      // If there are RR hosts, we need to find a lucky user
      if (
        [...qualifiedRRUsers, ...additionalFallbackRRUsers].length > 0 &&
        luckyUsers.length !== (Object.keys(nonEmptyHostGroups).length || 1)
      ) {
        throw new Error(ErrorCode.RoundRobinHostsUnavailableForBooking);
      }

      // Pushing fixed user before the luckyUser guarantees the (first) fixed user as the organizer.
      users = [...fixedUserPool, ...luckyUsers];
      luckyUserResponse = { luckyUsers: luckyUsers.map((u) => u.id) };
      troubleshooterData = {
        ...troubleshooterData,
        luckyUsers: luckyUsers.map((u) => u.id),
        fixedUsers: fixedUserPool.map((u) => u.id),
        luckyUserPool: Object.values(luckyUserPools)
          .flat()
          .map((u) => u.id),
      };
    } else if (
      input.bookingData.allRecurringDates &&
      eventType.schedulingType === SchedulingType.ROUND_ROBIN
    ) {
      // all recurring slots except the first one
      const luckyUsersFromFirstBooking = luckyUsers
        ? eventTypeWithUsers.users.filter((user) => luckyUsers.find((luckyUserId) => luckyUserId === user.id))
        : [];
      const fixedHosts = eventTypeWithUsers.users.filter((user: IsFixedAwareUser) => user.isFixed);
      users = [...fixedHosts, ...luckyUsersFromFirstBooking];
      troubleshooterData = {
        ...troubleshooterData,
        luckyUsersFromFirstBooking: luckyUsersFromFirstBooking.map((u) => u.id),
        fixedUsers: fixedHosts.map((u) => u.id),
      };
    }
  }

  if (users.length === 0 && eventType.schedulingType === SchedulingType.ROUND_ROBIN) {
    tracingLogger.error(`No available users found for round robin event.`);
    throw new Error(ErrorCode.RoundRobinHostsUnavailableForBooking);
  }

  // If the team member is requested then they should be the organizer
  const organizerUser = reqBody.teamMemberEmail
    ? (users.find((user) => user.email === reqBody.teamMemberEmail) ?? users[0])
    : users[0];

  const tOrganizer = await getTranslation(organizerUser?.locale ?? "en", "common");
  const allCredentials = await getAllCredentialsIncludeServiceAccountKey(organizerUser, eventType);

  // If the Organizer himself is rescheduling, the booker should be sent the communication in his timezone and locale.
  const attendeeInfoOnReschedule =
    userReschedulingIsOwner && originalRescheduledBooking
      ? originalRescheduledBooking.attendees.find((attendee) => attendee.email === bookerEmail)
      : null;

  const attendeeLanguage = attendeeInfoOnReschedule ? attendeeInfoOnReschedule.locale : language;
  const attendeeTimezone = attendeeInfoOnReschedule ? attendeeInfoOnReschedule.timeZone : reqBody.timeZone;

  const tAttendees = await getTranslation(attendeeLanguage ?? "en", "common");

  const isManagedEventType = !!eventType.parentId;

  // If location passed is empty , use default location of event
  // If location of event is not set , use host default
  if (locationBodyString.trim().length === 0) {
    if (eventType.locations.length > 0) {
      locationBodyString = eventType.locations[0].type;
    } else {
      locationBodyString = OrganizerDefaultConferencingAppType;
    }
  }

  // use host default
  if (locationBodyString === OrganizerDefaultConferencingAppType) {
    const metadataParseResult = userMetadataSchema.safeParse(organizerUser.metadata);
    const organizerMetadata = metadataParseResult.success ? metadataParseResult.data : undefined;
    const defaultApp = organizerMetadata?.defaultConferencingApp;

    if (defaultApp?.appSlug) {
      const app = getAppFromSlug(defaultApp.appSlug);
      locationBodyString = app?.appData?.location?.type || locationBodyString;

      const mainHostCalendar = eventType.destinationCalendar || organizerUser.destinationCalendar;

      if (locationBodyString === MeetLocationType && mainHostCalendar?.integration !== "google_calendar") {
        locationBodyString = "integrations:daily";
        organizerOrFirstDynamicGroupMemberDefaultLocationUrl = undefined;
      } else if (isManagedEventType || isTeamEventType) {
        organizerOrFirstDynamicGroupMemberDefaultLocationUrl = defaultApp?.appLink;
      }
    } else {
      locationBodyString = "integrations:daily";
    }
  }

  const invitee: Invitee = [
    {
      email: bookerEmail,
      name: fullName,
      phoneNumber: bookerPhoneNumber,
      firstName: (typeof bookerName === "object" && bookerName.firstName) || "",
      lastName: (typeof bookerName === "object" && bookerName.lastName) || "",
      timeZone: attendeeTimezone,
      language: { translate: tAttendees, locale: attendeeLanguage ?? "en" },
    },
  ];

  const blacklistedGuestEmails = process.env.BLACKLISTED_GUEST_EMAILS
    ? process.env.BLACKLISTED_GUEST_EMAILS.split(",")
    : [];

  const guestEmails = (reqGuests || []).map((email) => extractBaseEmail(email).toLowerCase());
  const guestUsers = await deps.userRepository.findManyByEmailsWithEmailVerificationSettings({
    emails: guestEmails,
  });

  const emailToRequiresVerification = new Map<string, boolean>();
  for (const user of guestUsers) {
    const matchedBase = extractBaseEmail(user.matchedEmail ?? user.email).toLowerCase();
    emailToRequiresVerification.set(matchedBase, user.requiresBookerEmailVerification === true);
  }

  const guestsRemoved: string[] = [];
  const guests = (reqGuests || []).reduce((guestArray, guest) => {
    const baseGuestEmail = extractBaseEmail(guest).toLowerCase();

    if (blacklistedGuestEmails.some((e) => e.toLowerCase() === baseGuestEmail)) {
      guestsRemoved.push(guest);
      return guestArray;
    }

    if (emailToRequiresVerification.get(baseGuestEmail)) {
      guestsRemoved.push(guest);
      return guestArray;
    }

    // If it's a team event, remove the team member from guests
    if (isTeamEventType && users.some((user) => user.email === guest)) {
      return guestArray;
    }
    guestArray.push({
      email: guest,
      name: "",
      firstName: "",
      lastName: "",
      timeZone: attendeeTimezone,
      language: { translate: tGuests, locale: "en" },
    });
    return guestArray;
  }, [] as Invitee);

  if (guestsRemoved.length > 0) {
    tracingLogger.info("Removed guests from the booking", guestsRemoved);
  }

  const seed = `${organizerUser.username}:${dayjs(reqBody.start).utc().format()}:${Date.now()}`;
  const uid = translator.fromUUID(uuidv5(seed, uuidv5.URL));

  // For static link based video apps, it would have the static URL value instead of it's type(e.g. integrations:campfire_video)
  // This ensures that createMeeting isn't called for static video apps as bookingLocation becomes just a regular value for them.
  const { bookingLocation, conferenceCredentialId: eventTypeCredentialId } =
    organizerOrFirstDynamicGroupMemberDefaultLocationUrl
      ? {
          bookingLocation: organizerOrFirstDynamicGroupMemberDefaultLocationUrl,
          conferenceCredentialId: undefined,
        }
      : getLocationValueForDB(locationBodyString, eventType.locations);

  // Use per-host credential if available, otherwise fall back to event type credential
  const conferenceCredentialId = eventTypeCredentialId;

  tracingLogger.info("locationBodyString", locationBodyString);
  tracingLogger.info("event type locations", eventType.locations);

  const customInputs = getCustomInputsResponses(reqBody, eventType.customInputs);
  const attendeesList = [...invitee, ...guests];

  const responses = reqBody.responses || null;
  const evtName = !eventType?.isDynamic ? eventType.eventName : responses?.title;
  const eventNameObject = {
    //TODO: Can we have an unnamed attendee? If not, I would really like to throw an error here.
    attendeeName: fullName || "Nameless",
    eventType: eventType.title,
    eventName: evtName,
    // we send on behalf of team if >1 round robin attendee | collective
    teamName: eventType.schedulingType === "COLLECTIVE" || users.length > 1 ? eventType.team?.name : null,
    // TODO: Can we have an unnamed organizer? If not, I would really like to throw an error here.
    host: organizerUser.name || "Nameless",
    location: bookingLocation,
    eventDuration: dayjs(reqBody.end).diff(reqBody.start, "minutes"),
    bookingFields: { ...responses },
    t: tOrganizer,
  };

  const iCalUID = getICalUID({
    event: { iCalUID: originalRescheduledBooking?.iCalUID, uid: originalRescheduledBooking?.uid },
    uid,
  });
  // For bookings made before introducing iCalSequence, assume that the sequence should start at 1. For new bookings start at 0.
  const iCalSequence = getICalSequence(originalRescheduledBooking);
  const organizerOrganizationProfile = await deps.prismaClient.profile.findFirst({
    where: {
      userId: organizerUser.id,
    },
    select: {
      organizationId: true,
      username: true,
      organization: { select: { hideBranding: true } },
    },
  });

  const organizerOrganizationId = organizerOrganizationProfile?.organizationId;
  const bookerUrl = process.env.NEXT_PUBLIC_WEBAPP_URL || "https://app.cal.com";

  const destinationCalendar = eventType.destinationCalendar
    ? [eventType.destinationCalendar]
    : organizerUser.destinationCalendar
      ? [organizerUser.destinationCalendar]
      : null;

  let organizerEmail = organizerUser.email || "Email-less";
  if (eventType.useEventTypeDestinationCalendarEmail && destinationCalendar?.[0]?.primaryEmail) {
    organizerEmail = destinationCalendar[0].primaryEmail;
  } else if (eventType.secondaryEmailId && eventType.secondaryEmail?.email) {
    organizerEmail = eventType.secondaryEmail.email;
  }

  //update cal event responses with latest location value , later used by webhook
  if (reqBody.calEventResponses)
    reqBody.calEventResponses.location.value = {
      value: platformBookingLocation ?? bookingLocation,
      optionValue: "",
    };

  // Only attach recurring config when this booking belongs to a recurring series.
  const computedRecurringEvent =
    reqBody.recurringEventId && eventType.recurringEvent
      ? { ...eventType.recurringEvent, count: recurringCount ?? eventType.recurringEvent.count }
      : undefined;

  const { teamMembers, teamDestinationCalendars } = await computeTeamData({
    isTeamEventType,
    schedulingType: eventType.schedulingType,
    users,
    organizerEmail: organizerUser.email,
  });

  const teamInfo = eventType.team;

  const eventName = getEventName(eventNameObject);

  let evt: BuiltCalendarEvent = new CalendarEventBuilder({
    bookerUrl,
    title: eventName,
    startTime: dayjs(reqBody.start).utc().format(),
    endTime: dayjs(reqBody.end).utc().format(),
    type: eventType.slug,
    organizer: {
      id: organizerUser.id,
      name: organizerUser.name || "Nameless",
      email: organizerEmail,
      username: organizerUser.username || undefined,
      usernameInOrg: organizerOrganizationProfile?.username || undefined,
      timeZone: organizerUser.timeZone,
      language: { translate: tOrganizer, locale: organizerUser.locale ?? "en" },
      timeFormat: getTimeFormatStringFromUserTimeFormat(organizerUser.timeFormat),
    },
    attendees: attendeesList,
    additionalNotes,
  })
    .withEventType({
      description: eventType.description,
      id: eventType.id,
      hideCalendarNotes: eventType.hideCalendarNotes,
      hideCalendarEventDetails: eventType.hideCalendarEventDetails,
      hideOrganizerEmail: eventType.hideOrganizerEmail,
      schedulingType: eventType.schedulingType,
      seatsPerTimeSlot: eventType.seatsPerTimeSlot,
      // if seats are not enabled we should default true
      seatsShowAttendees: eventType.seatsPerTimeSlot ? eventType.seatsShowAttendees : true,
      seatsShowAvailabilityCount: eventType.seatsPerTimeSlot ? eventType.seatsShowAvailabilityCount : true,
      customReplyToEmail: eventType.customReplyToEmail,
      disableRescheduling: eventType.disableRescheduling ?? false,
      disableCancelling: eventType.disableCancelling ?? false,
    })
    .withMetadataAndResponses({
      additionalNotes,
      customInputs,
      responses: reqBody.calEventResponses || null,
      userFieldsResponses: reqBody.calEventUserFieldsResponses || null,
    })
    .withLocation({
      location: platformBookingLocation ?? bookingLocation, // Will be processed by the EventManager later.
      conferenceCredentialId,
    })
    .withDestinationCalendar(
      teamDestinationCalendars.length > 0
        ? [...(destinationCalendar ?? []), ...teamDestinationCalendars]
        : destinationCalendar
    )
    .withIdentifiers({ iCalUID, iCalSequence })
    .withConfirmation({
      requiresConfirmation: !isConfirmedByDefault,
      isConfirmedByDefault,
    })
    .withPlatformVariables({
      platformClientId,
      platformRescheduleUrl,
      platformCancelUrl,
      platformBookingUrl,
    })
    .withOrganization(organizerOrganizationId)
    .withHashedLink(hasHashedBookingLink ? (reqBody.hashedLink ?? null) : null)
    .withRecurring(computedRecurringEvent ?? undefined)
    .withRecurringEventId(input.bookingData.thirdPartyRecurringEventId)
    .withTeam(
      isTeamEventType
        ? {
            members: teamMembers,
            name: teamInfo?.name || "Nameless",
            id: teamInfo?.id ?? 0,
          }
        : undefined
    )
    .withHideBranding(
      await getEventTypeService().shouldHideBrandingForEventType(eventType.id, {
        team: eventType.team
          ? { hideBranding: eventType.team.hideBranding, parent: eventType.team.parent }
          : null,
        owner: {
          id: organizerUser.id,
          hideBranding: organizerUser.hideBranding,
          profiles: organizerOrganizationProfile
            ? [{ organization: organizerOrganizationProfile.organization }]
            : [],
        },
      } satisfies EventTypeBrandingData)
    )
    .build();

  // data needed for triggering webhooks
  const eventTypeInfo: EventTypeInfo = {
    eventTitle: eventType.title,
    eventDescription: eventType.description,
    price: paymentAppData.price,
    currency: eventType.currency,
    length: dayjs(reqBody.end).diff(dayjs(reqBody.start), "minutes"),
  };

  const subscriberOptions: GetSubscriberOptions = {
    userId: organizerUser.id,
    eventTypeId,
    triggerEvent: WebhookTriggerEvents.BOOKING_CREATED,
    teamId: null,
    orgId: null,
    oAuthClientId: platformClientId,
  };

  const eventTrigger: WebhookTriggerEvents = rescheduleUid
    ? WebhookTriggerEvents.BOOKING_RESCHEDULED
    : WebhookTriggerEvents.BOOKING_CREATED;

  subscriberOptions.triggerEvent = eventTrigger;

  const subscriberOptionsMeetingEnded = {
    userId: organizerUser.id,
    eventTypeId,
    triggerEvent: WebhookTriggerEvents.MEETING_ENDED,
    teamId: null,
    orgId: null,
    oAuthClientId: platformClientId,
  };

  const subscriberOptionsMeetingStarted = {
    userId: organizerUser.id,
    eventTypeId,
    triggerEvent: WebhookTriggerEvents.MEETING_STARTED,
    teamId: null,
    orgId: null,
    oAuthClientId: platformClientId,
  };

  const spamCheckResult = await spamCheckService.waitForCheck();

  if (spamCheckResult.isBlocked) {
    const DECOY_ORGANIZER_NAMES = ["Alex Smith", "Jordan Taylor", "Sam Johnson", "Chris Morgan"];
    const randomOrganizerName =
      DECOY_ORGANIZER_NAMES[Math.floor(Math.random() * DECOY_ORGANIZER_NAMES.length)];

    const eventName = getEventName({
      ...eventNameObject,
      host: randomOrganizerName,
    });

    return {
      id: 0,
      uid,
      iCalUID: "",
      status: BookingStatus.ACCEPTED,
      eventTypeId: eventType.id,
      user: {
        name: randomOrganizerName,
        timeZone: "UTC",
        email: null,
      },
      userId: null,
      userUuid: null,
      title: eventName,
      startTime: new Date(reqBody.start),
      endTime: new Date(reqBody.end),
      createdAt: new Date(),
      updatedAt: new Date(),
      attendees: [
        {
          id: 0,
          email: bookerEmail,
          name: fullName,
          timeZone: reqBody.timeZone,
          locale: null,
          phoneNumber: null,
          bookingId: null,
          noShow: null,
        },
      ],
      oneTimePassword: null,
      smsReminderNumber: null,
      metadata: {},
      idempotencyKey: null,
      userPrimaryEmail: null,
      description: eventType.description || null,
      customInputs: null,
      responses: null,
      location: bookingLocation,
      paid: false,
      cancellationReason: null,
      rejectionReason: null,
      dynamicEventSlugRef: null,
      dynamicGroupSlugRef: null,
      fromReschedule: null,
      recurringEventId: null,
      scheduledJobs: [],
      rescheduledBy: null,
      destinationCalendarId: null,
      reassignReason: null,
      reassignById: null,
      rescheduled: false,
      isRecorded: false,
      iCalSequence: 0,
      rating: null,
      ratingFeedback: null,
      noShowHost: null,
      cancelledBy: null,
      creationSource: CreationSource.WEBAPP,
      references: [],
      payment: [],
      isDryRun: false,
      paymentRequired: false,
      paymentUid: undefined,
      luckyUsers: [],
      paymentId: undefined,
      seatReferenceUid: undefined,
      isShortCircuitedBooking: true,
      previousBooking: originalRescheduledBooking
        ? {
            uid: originalRescheduledBooking.uid,
            startTime: originalRescheduledBooking.startTime,
            endTime: originalRescheduledBooking.endTime,
          }
        : null,
    };
  }

  // For seats, if the booking already exists then we want to add the new attendee to the existing booking
  if (eventType.seatsPerTimeSlot) {
    const newBooking = await handleSeats({
      rescheduleUid,
      reqBookingUid: reqBody.bookingUid,
      eventType,
      evt,
      invitee,
      allCredentials,
      organizerUser,
      originalRescheduledBooking,
      bookerEmail,
      bookerPhoneNumber,
      tAttendees,
      bookingSeat,
      reqUserId: input.userId,
      reqUserUuid: userUuid,
      rescheduleReason,
      reqBodyUser: reqBody.user,
      noEmail,
      isConfirmedByDefault,
      additionalNotes,
      reqAppsStatus,
      attendeeLanguage,
      paymentAppData,
      fullName,
      smsReminderNumber,
      eventTypeInfo,
      uid,
      eventTypeId,
      reqBodyMetadata: reqBody.metadata,
      subscriberOptions,
      eventTrigger,
      responses,
      rescheduledBy: reqBody.rescheduledBy,
      isDryRun,
      traceContext,
    });

    if (newBooking) {
      const bookingResponse = {
        ...newBooking,
        user: {
          ...newBooking.user,
          email: null,
        },
        paymentRequired: false,
        isDryRun: isDryRun,
        ...(isDryRun ? { troubleshooterData } : {}),
      };
      return {
        ...bookingResponse,
        ...luckyUserResponse,
        previousBooking: originalRescheduledBooking
          ? {
              uid: originalRescheduledBooking.uid,
              startTime: originalRescheduledBooking.startTime,
              endTime: originalRescheduledBooking.endTime,
            }
          : null,
      };
    } else {
      // Rescheduling logic for the original seated event was handled in handleSeats
      // We want to use new booking logic for the new time slot
      originalRescheduledBooking = null;
      const updatedEvt = CalendarEventBuilder.fromEvent(evt)
        ?.withIdentifiers({
          iCalUID: getICalUID({
            attendeeId: bookingSeat?.attendeeId,
          }),
        })
        .build();

      evt = updatedEvt;
    }
  }

  const changedOrganizer =
    !!originalRescheduledBooking &&
    (eventType.schedulingType === SchedulingType.ROUND_ROBIN ||
      eventType.schedulingType === SchedulingType.COLLECTIVE) &&
    originalRescheduledBooking.userId !== evt.organizer.id;

  const skipDeleteEventsAndMeetings = changedOrganizer;

  const isBookingRequestedReschedule =
    !!originalRescheduledBooking &&
    !!originalRescheduledBooking.rescheduled &&
    originalRescheduledBooking.status === BookingStatus.CANCELLED;

  if (
    changedOrganizer &&
    originalRescheduledBooking &&
    originalRescheduledBooking?.user?.name &&
    organizerUser?.name
  ) {
    evt.title = updateHostInEventName(
      originalRescheduledBooking.title,
      originalRescheduledBooking.user.name,
      organizerUser.name
    );
  }

  let results: EventResult<AdditionalInformation & { url?: string; iCalUID?: string }>[] = [];
  let referencesToCreate: PartialReference[] = [];

  let booking: CreatedBooking | null = null;

  tracingLogger.debug(
    "Going to create booking in DB now",
    safeStringify({
      organizerUser: organizerUser.id,
      attendeesList: attendeesList.map((guest) => ({ timeZone: guest.timeZone })),
      requiresConfirmation: evt.requiresConfirmation,
      isConfirmedByDefault,
      userReschedulingIsOwner,
    })
  );

  let assignmentReason: { reasonEnum: AssignmentReasonEnum; reasonString: string } | undefined;

  try {
    if (!isDryRun) {
      booking = await createBooking({
        uid,
        rescheduledBy: reqBody.rescheduledBy,
        reqBody: {
          user: reqBody.user,
          metadata: reqBody.metadata,
          recurringEventId: reqBody.recurringEventId,
        },
        eventType: {
          eventTypeData: eventType,
          id: eventTypeId,
          slug: eventTypeSlug,
          organizerUser,
          isConfirmedByDefault,
          paymentAppData,
        },
        input: {
          bookerEmail,
          rescheduleReason,
          smsReminderNumber,
          responses,
        },
        evt,
        originalRescheduledBooking,
        creationSource: input.bookingData.creationSource,
        tracking: reqBody.tracking,
      });

      if (booking?.userId) {
        const usersRepository = new UsersRepository();
        await usersRepository.updateLastActiveAt(booking.userId);
        const organizerUserAvailability = availableUsers.find((user) => user.id === booking?.userId);

        criticalLogger.info(`Booking created`, {
          bookingUid: booking.uid,
          selectedCalendarIds: organizerUser.allSelectedCalendars?.map((c) => c.id) ?? [],
          availabilitySnapshot: organizerUserAvailability?.availabilityData
            ? formatAvailabilitySnapshot(organizerUserAvailability.availabilityData)
            : null,
        });
      }

      evt = CalendarEventBuilder.fromEvent(evt)
        .withUid(booking.uid ?? null)
        .build();

      evt = CalendarEventBuilder.fromEvent(evt)
        .withOneTimePassword(booking.oneTimePassword ?? null)
        .build();

      // Add assignment reason to evt for emails
      if (assignmentReason) {
        evt = CalendarEventBuilder.fromEvent(evt)
          .withAssignmentReason({
            category: getAssignmentReasonCategory(assignmentReason.reasonEnum),
            details: assignmentReason.reasonString ?? null,
          })
          .build();
      }

      if (booking?.id && eventType.seatsPerTimeSlot) {
        const currentAttendee = booking.attendees.find(
          (attendee) =>
            attendee.email === bookingData.responses.email ||
            (bookingData.responses.attendeePhoneNumber &&
              attendee.phoneNumber === bookingData.responses.attendeePhoneNumber)
        );

        // Save description to bookingSeat
        const uniqueAttendeeId = uuid();
        await deps.prismaClient.bookingSeat.create({
          data: {
            referenceUid: uniqueAttendeeId,
            data: {
              description: additionalNotes,
              responses,
            },
            metadata: reqBody.metadata,
            booking: {
              connect: {
                id: booking.id,
              },
            },
            attendee: {
              connect: {
                id: currentAttendee?.id,
              },
            },
          },
        });
        evt.attendeeSeatId = uniqueAttendeeId;
      }
    } else {
      const { booking: dryRunBooking, troubleshooterData: _troubleshooterData } = buildDryRunBooking({
        eventTypeId,
        organizerUser,
        eventName,
        startTime: reqBody.start,
        endTime: reqBody.end,
        contactOwnerFromReq,
        contactOwnerEmail,
        allHostUsers: users,
        isManagedEventType,
      });

      booking = dryRunBooking;
      troubleshooterData = {
        ...troubleshooterData,
        ..._troubleshooterData,
      };
    }
  } catch (_err) {
    const err = getServerErrorFromUnknown(_err);
    tracingLogger.error(`Booking ${eventTypeId} failed`, "Error when saving booking to db", err.message);
    if (err.cause && typeof err.cause === "object" && "code" in err.cause && err.cause.code === "P2002") {
      throw new HttpError({
        statusCode: 409,
        message: ErrorCode.BookingConflict,
      });
    }
    throw err;
  }

  // After polling videoBusyTimes, credentials might have been changed due to refreshment, so query them again.
  const credentials = await refreshCredentials(allCredentials);
  const apps = eventTypeAppMetadataOptionalSchema.parse(eventType?.metadata?.apps);
  const eventManager =
    !isDryRun && !skipCalendarSyncTaskCreation
      ? new EventManager({ ...organizerUser, credentials }, apps)
      : buildDryRunEventManager();

  let videoCallUrl;

  // this is the actual rescheduling logic
  if (!eventType.seatsPerTimeSlot && originalRescheduledBooking?.uid) {
    tracingLogger.silly("Rescheduling booking", originalRescheduledBooking.uid);
    evt = CalendarEventBuilder.fromEvent(evt)
      .withVideoCallDataFromReferences(originalRescheduledBooking.references)
      .build();
    evt.rescheduledBy = reqBody.rescheduledBy;

    // If organizer is changed in RR event then we need to delete the previous host destination calendar events
    const previousHostDestinationCalendar = originalRescheduledBooking?.destinationCalendar
      ? [originalRescheduledBooking?.destinationCalendar]
      : [];

    if (changedOrganizer) {
      // location might changed and will be new created in eventManager.create (organizer default location)
      evt.videoCallData = undefined;
      // To prevent "The requested identifier already exists" error while updating event, we need to remove iCalUID
      evt.iCalUID = undefined;
      evt.hasOrganizerChanged = true;
    }

    if (changedOrganizer && originalRescheduledBooking?.user) {
      const originalHostCredentials = await getAllCredentialsIncludeServiceAccountKey(
        originalRescheduledBooking.user,
        eventType
      );
      const refreshedOriginalHostCredentials = await refreshCredentials(originalHostCredentials);

      // Create EventManager with original host's credentials for deletion operations
      const originalHostEventManager = new EventManager(
        { ...originalRescheduledBooking.user, credentials: refreshedOriginalHostCredentials },
        apps
      );
      tracingLogger.debug("RescheduleOrganizerChanged: Deleting Event and Meeting for previous booking");
      // Create deletion event with original host's organizer info and original booking properties
      const deletionEvent = {
        ...evt,
        organizer: {
          id: originalRescheduledBooking.user.id,
          name: originalRescheduledBooking.user.name || "",
          email: originalRescheduledBooking.user.email,
          username: originalRescheduledBooking.user.username || undefined,
          timeZone: originalRescheduledBooking.user.timeZone,
          language: { translate: tOrganizer, locale: originalRescheduledBooking.user.locale ?? "en" },
          timeFormat: getTimeFormatStringFromUserTimeFormat(originalRescheduledBooking.user.timeFormat),
        },
        destinationCalendar: previousHostDestinationCalendar,
        // Override with original booking properties used by deletion operations
        startTime: originalRescheduledBooking.startTime.toISOString(),
        endTime: originalRescheduledBooking.endTime.toISOString(),
        uid: originalRescheduledBooking.uid,
        location: originalRescheduledBooking.location,
        responses: originalRescheduledBooking.responses
          ? (originalRescheduledBooking.responses as CalEventResponses)
          : evt.responses,
      };

      if (!skipCalendarSyncTaskCreation) {
        await originalHostEventManager.deleteEventsAndMeetings({
          event: deletionEvent,
          bookingReferences: originalRescheduledBooking.references,
        });
      }
    }
    // This gets overridden when updating the event - to check if notes have been hidden or not. We just reset this back
    // to the default description when we are sending the emails.
    evt.description = eventType.description;

    const updateManager = !skipCalendarSyncTaskCreation
      ? await eventManager.reschedule(
          evt,
          originalRescheduledBooking.uid,
          undefined,
          changedOrganizer,
          previousHostDestinationCalendar,
          isBookingRequestedReschedule,
          skipDeleteEventsAndMeetings
        )
      : placeholderCreatedEvent;

    results = updateManager.results;
    referencesToCreate = updateManager.referencesToCreate;

    videoCallUrl = evt.videoCallData?.url ? evt.videoCallData.url : null;

    // This gets overridden when creating the event - to check if notes have been hidden or not. We just reset this back
    // to the default description when we are sending the emails.
    evt.description = eventType.description;

    const { metadata: videoMetadata, videoCallUrl: _videoCallUrl } = getVideoCallDetails({
      results,
    });

    let metadata: AdditionalInformation = {};
    metadata = videoMetadata;
    videoCallUrl = _videoCallUrl;

    const isThereAnIntegrationError = results?.some((res) => !res.success);

    if (isThereAnIntegrationError) {
      const error = {
        errorCode: "BookingReschedulingMeetingFailed",
        message: "Booking Rescheduling failed",
      };

      tracingLogger.error(
        `EventManager.reschedule failure in some of the integrations ${organizerUser.username}`,
        safeStringify({ error, results })
      );
    } else {
      if (results.length) {
        // Handle Google Meet results
        // We use the original booking location since the evt location changes to daily
        if (bookingLocation === MeetLocationType) {
          const googleMeetResult = {
            appName: GoogleMeetMetadata.name,
            type: "conferencing",
            uid: results[0].uid,
            originalEvent: results[0].originalEvent,
          };

          // Find index of google_calendar inside createManager.referencesToCreate
          const googleCalIndex = updateManager.referencesToCreate.findIndex(
            (ref) => ref.type === "google_calendar"
          );
          const googleCalResult = results[googleCalIndex];

          if (!googleCalResult) {
            tracingLogger.warn("Google Calendar not installed but using Google Meet as location");
            results.push({
              ...googleMeetResult,
              success: false,
              calWarnings: [tOrganizer("google_meet_warning")],
            });
          }

          const googleHangoutLink = Array.isArray(googleCalResult?.updatedEvent)
            ? googleCalResult.updatedEvent[0]?.hangoutLink
            : (googleCalResult?.updatedEvent?.hangoutLink ?? googleCalResult?.createdEvent?.hangoutLink);

          if (googleHangoutLink) {
            results.push({
              ...googleMeetResult,
              success: true,
            });

            // Add google_meet to referencesToCreate in the same index as google_calendar
            updateManager.referencesToCreate[googleCalIndex] = {
              ...updateManager.referencesToCreate[googleCalIndex],
              meetingUrl: googleHangoutLink,
            };

            // Also create a new referenceToCreate with type video for google_meet
            updateManager.referencesToCreate.push({
              type: "google_meet_video",
              meetingUrl: googleHangoutLink,
              uid: googleCalResult.uid,
              credentialId: updateManager.referencesToCreate[googleCalIndex].credentialId,
            });
          } else if (googleCalResult && !googleHangoutLink) {
            results.push({
              ...googleMeetResult,
              success: false,
            });
          }
        }
        const createdOrUpdatedEvent = Array.isArray(results[0]?.updatedEvent)
          ? results[0]?.updatedEvent[0]
          : (results[0]?.updatedEvent ?? results[0]?.createdEvent);
        metadata.hangoutLink = createdOrUpdatedEvent?.hangoutLink;
        metadata.conferenceData = createdOrUpdatedEvent?.conferenceData;
        metadata.entryPoints = createdOrUpdatedEvent?.entryPoints;
        evt.appsStatus = handleAppsStatus(results, booking, reqAppsStatus);
        videoCallUrl =
          metadata.hangoutLink ||
          createdOrUpdatedEvent?.url ||
          organizerOrFirstDynamicGroupMemberDefaultLocationUrl ||
          getVideoCallUrlFromCalEvent(evt) ||
          videoCallUrl;
      }

      const calendarResult = results.find((result) => result.type.includes("_calendar"));

      evt.iCalUID = Array.isArray(calendarResult?.updatedEvent)
        ? calendarResult?.updatedEvent[0]?.iCalUID
        : calendarResult?.updatedEvent?.iCalUID || undefined;
    }

    evt.appsStatus = handleAppsStatus(results, booking, reqAppsStatus);

    if (!noEmail && isConfirmedByDefault && !isDryRun) {
      await emailsAndSmsHandler.send({
        action: BookingActionMap.rescheduled,
        data: {
          evt,
          eventType,
          additionalInformation: metadata,
          additionalNotes,
          iCalUID,
          originalRescheduledBooking,
          rescheduleReason,
          isRescheduledByBooker: reqBody.rescheduledBy === bookerEmail,
          users,
          changedOrganizer,
        },
      });
      bookingEmailsAndSmsTaskerAction = BookingActionMap.rescheduled;
    }
    // If it's not a reschedule, doesn't require confirmation and there's no price,
    // Create a booking
  } else if (isConfirmedByDefault) {
    const shouldSkipCalendarEvents = !areCalendarEventsEnabled || skipCalendarSyncTaskCreation;
    const createManager = await eventManager.create(evt, { skipCalendarEvent: shouldSkipCalendarEvents });
    if (evt.location) {
      booking.location = evt.location;
    }
    // This gets overridden when creating the event - to check if notes have been hidden or not. We just reset this back
    // to the default description when we are sending the emails.
    evt.description = eventType.description;

    results = createManager.results;
    referencesToCreate = createManager.referencesToCreate;
    videoCallUrl = evt.videoCallData?.url ? evt.videoCallData.url : null;

    const calendarResults = results.filter((res) => res.type.includes("_calendar"));
    
   
    const isCalendarSyncFailure = calendarResults.length > 0 && calendarResults.every((res) => !res.success);
    

    const allIntegrationsFailed = results.length > 0 && results.every((res) => !res.success);

    if (isCalendarSyncFailure || allIntegrationsFailed  ) {
      const error = {
        errorCode: "BookingCreatingMeetingFailed",
        message: "Booking failed",
      };

      if (!isDryRun && booking && booking.id) {
        await deps.prismaClient.booking.update({
          where: { id: booking.id },
          data: {
            status: BookingStatus.CANCELLED,
            cancellationReason: "Calendar integration failed to create the event.",
          },
        });
      }

      tracingLogger.error(
        `EventManager.create failure in some of the integrations ${organizerUser.username}`,
        safeStringify({ error, results })
      );

      throw new HttpError({
        statusCode: 500,
        message: "Failed to create calendar event. Booking cancelled.",
      });
      
    } else {
      const additionalInformation: AdditionalInformation = {};

      if (results.length) {
        // Handle Google Meet results
        // We use the original booking location since the evt location changes to daily
        if (bookingLocation === MeetLocationType) {
          const googleMeetResult = {
            appName: GoogleMeetMetadata.name,
            type: "conferencing",
            uid: results[0].uid,
            originalEvent: results[0].originalEvent,
          };

          // Find index of google_calendar inside createManager.referencesToCreate
          const googleCalIndex = createManager.referencesToCreate.findIndex(
            (ref) => ref.type === "google_calendar"
          );
          const googleCalResult = results[googleCalIndex];

          if (!googleCalResult) {
            tracingLogger.warn("Google Calendar not installed but using Google Meet as location");
            results.push({
              ...googleMeetResult,
              success: false,
              calWarnings: [tOrganizer("google_meet_warning")],
            });
          }

          if (googleCalResult?.createdEvent?.hangoutLink) {
            results.push({
              ...googleMeetResult,
              success: true,
            });

            // Add google_meet to referencesToCreate in the same index as google_calendar
            createManager.referencesToCreate[googleCalIndex] = {
              ...createManager.referencesToCreate[googleCalIndex],
              meetingUrl: googleCalResult.createdEvent.hangoutLink,
            };

            // Also create a new referenceToCreate with type video for google_meet
            createManager.referencesToCreate.push({
              type: "google_meet_video",
              meetingUrl: googleCalResult.createdEvent.hangoutLink,
              uid: googleCalResult.uid,
              credentialId: createManager.referencesToCreate[googleCalIndex].credentialId,
            });
          } else if (googleCalResult && !googleCalResult.createdEvent?.hangoutLink) {
            results.push({
              ...googleMeetResult,
              success: false,
            });
          }
        }
        // TODO: Handle created event metadata more elegantly
        additionalInformation.hangoutLink = results[0].createdEvent?.hangoutLink;
        additionalInformation.conferenceData = results[0].createdEvent?.conferenceData;
        additionalInformation.entryPoints = results[0].createdEvent?.entryPoints;
        evt.appsStatus = handleAppsStatus(results, booking, reqAppsStatus);
        videoCallUrl =
          additionalInformation.hangoutLink ||
          organizerOrFirstDynamicGroupMemberDefaultLocationUrl ||
          videoCallUrl;

        if (!isDryRun && evt.iCalUID !== booking.iCalUID) {
          // The eventManager could change the iCalUID. At this point we can update the DB record
          await deps.prismaClient.booking.update({
            where: {
              id: booking.id,
            },
            data: {
              iCalUID: evt.iCalUID || booking.iCalUID,
            },
          });
        }
      }
      if (!noEmail) {
        if (!isDryRun && !(eventType.seatsPerTimeSlot && rescheduleUid)) {
          await emailsAndSmsHandler.send({
            action: BookingActionMap.confirmed,
            data: {
              eventType: {
                metadata: eventType.metadata,
                schedulingType: eventType.schedulingType,
              },
              eventNameObject,
              evt,
              additionalInformation,
              additionalNotes,
              customInputs,
            },
          });
          bookingEmailsAndSmsTaskerAction = BookingActionMap.confirmed;
        }
      }
    }
  } else {
    // If isConfirmedByDefault is false, then booking can't be considered ACCEPTED and thus EventManager has no role to play. Booking is created as PENDING
    tracingLogger.debug(
      `EventManager doesn't need to create or reschedule event for booking ${organizerUser.username}`,
      safeStringify({
        calEvent: getPiiFreeCalendarEvent(evt),
        isConfirmedByDefault,
        paymentValue: paymentAppData.price,
      })
    );
  }

  const bookingRequiresPayment =
    !Number.isNaN(paymentAppData.price) &&
    paymentAppData.price > 0 &&
    !originalRescheduledBooking?.paid &&
    !!booking;

  if (!isConfirmedByDefault && noEmail !== true && !bookingRequiresPayment) {
    tracingLogger.debug(
      `Emails: Booking ${organizerUser.username} requires confirmation, sending request emails`,
      safeStringify({
        calEvent: getPiiFreeCalendarEvent(evt),
      })
    );
    if (!isDryRun) {
      await emailsAndSmsHandler.send({
        action: BookingActionMap.requested,
        data: { evt, attendees: attendeesList, eventType, additionalNotes },
      });
      bookingEmailsAndSmsTaskerAction = BookingActionMap.requested;
    }
  }

  if (booking.location?.startsWith("http")) {
    videoCallUrl = booking.location;
  }

  const metadata = videoCallUrl
    ? {
        videoCallUrl: getVideoCallUrlFromCalEvent(evt) || videoCallUrl,
      }
    : undefined;

  const isBookingEmailSmsTaskerEnabled = false;

  await this.fireBookingEvents({
    booking: {
      ...booking,
      userEmail: booking.user?.email ?? null,
    },
    organizerUser,
    hashedLink: hasHashedBookingLink ? (reqBody.hashedLink ?? null) : null,
    isDryRun,
    bookerEmail,
    bookerName: fullName,
    originalRescheduledBooking,
    isRecurringBooking: !!input.bookingData.allRecurringDates,
    tracingLogger,
  });

  const webhookLocation = metadata?.videoCallUrl || evt.location;

  const webhookData: EventPayloadType = {
    ...evt,
    ...eventTypeInfo,
    bookingId: booking?.id,
    rescheduleId: originalRescheduledBooking?.id || undefined,
    rescheduleUid,
    rescheduleStartTime: originalRescheduledBooking?.startTime
      ? dayjs(originalRescheduledBooking?.startTime).utc().format()
      : undefined,
    rescheduleEndTime: originalRescheduledBooking?.endTime
      ? dayjs(originalRescheduledBooking?.endTime).utc().format()
      : undefined,
    metadata: { ...metadata, ...reqBody.metadata },
    eventTypeId,
    status: "ACCEPTED",
    smsReminderNumber: booking?.smsReminderNumber || undefined,
    rescheduledBy: reqBody.rescheduledBy,
    location: webhookLocation,
    ...(assignmentReason ? { assignmentReason: [assignmentReason] } : {}),
  };

  if (bookingRequiresPayment) {
    tracingLogger.debug(`Booking ${organizerUser.username} requires payment`);
    // Load credentials.app.categories
    const credentialPaymentAppCategories = await deps.prismaClient.credential.findMany({
      where: {
        ...(paymentAppData.credentialId ? { id: paymentAppData.credentialId } : { userId: organizerUser.id }),
        app: {
          categories: {
            hasSome: ["payment"],
          },
        },
      },
      select: {
        key: true,
        appId: true,
        app: {
          select: {
            categories: true,
            dirName: true,
          },
        },
      },
    });
    const eventTypePaymentAppCredential = credentialPaymentAppCategories.find((credential) => {
      return credential.appId === paymentAppData.appId;
    });

    if (!eventTypePaymentAppCredential) {
      throw new HttpError({
        statusCode: 400,
        message: "Missing payment credentials",
      });
    }

    // Convert type of eventTypePaymentAppCredential to appId: EventTypeAppList
    if (!booking.user) booking.user = organizerUser;
    const payment = await handlePayment({
      evt,
      selectedEventType: {
        ...eventType,
        metadata: eventType.metadata
          ? {
              ...eventType.metadata,
              apps: eventType.metadata?.apps as Prisma.JsonValue,
            }
          : {},
      },
      paymentAppCredentials: eventTypePaymentAppCredential as IEventTypePaymentCredentialType,
      booking,
      bookerName: fullName,
      bookerEmail,
      bookerPhoneNumber,
      isDryRun,
      bookingFields: eventType.bookingFields,
      locale: language,
    });
    const subscriberOptionsPaymentInitiated: GetSubscriberOptions = {
      userId: organizerUser.id,
      eventTypeId,
      triggerEvent: WebhookTriggerEvents.BOOKING_PAYMENT_INITIATED,
      teamId: null,
      orgId: null,
      oAuthClientId: platformClientId,
    };
    await handleWebhookTrigger({
      subscriberOptions: subscriberOptionsPaymentInitiated,
      eventTrigger: WebhookTriggerEvents.BOOKING_PAYMENT_INITIATED,
      webhookData: {
        ...webhookData,
        paymentId: payment?.id,
      },
      isDryRun,
      traceContext,
    });

    // TODO: Refactor better so this booking object is not passed
    // all around and instead the individual fields are sent as args.
    const bookingResponse = {
      ...booking,
      user: {
        ...booking.user,
        email: null,
      },
      videoCallUrl: metadata?.videoCallUrl,
      // Ensure seatReferenceUid is properly typed as string | null
      seatReferenceUid: evt.attendeeSeatId,
    };

    return {
      ...bookingResponse,
      ...luckyUserResponse,
      message: "Payment required",
      paymentRequired: true,
      paymentUid: payment?.uid,
      paymentId: payment?.id,
      isDryRun,
      ...(isDryRun ? { troubleshooterData } : {}),
      previousBooking: originalRescheduledBooking
        ? {
            uid: originalRescheduledBooking.uid,
            startTime: originalRescheduledBooking.startTime,
            endTime: originalRescheduledBooking.endTime,
          }
        : null,
    };
  }

  tracingLogger.debug(`Booking ${organizerUser.username} completed`);

  // We are here so, booking doesn't require payment and booking is also created in DB already, through createBooking call
  if (isConfirmedByDefault) {
    const subscribersMeetingEnded = await getWebhooks(subscriberOptionsMeetingEnded);
    const subscribersMeetingStarted = await getWebhooks(subscriberOptionsMeetingStarted);

    const deleteWebhookScheduledTriggerPromises: Promise<unknown>[] = [];
    const scheduleTriggerPromises = [];

    if (rescheduleUid && originalRescheduledBooking) {
      //delete all scheduled triggers for meeting ended and meeting started of booking
      deleteWebhookScheduledTriggerPromises.push(
        deleteWebhookScheduledTriggers({
          booking: originalRescheduledBooking,
          isDryRun,
        })
      );
      deleteWebhookScheduledTriggerPromises.push(
        cancelNoShowTasksForBooking({
          bookingUid: originalRescheduledBooking.uid,
        })
      );
    }

    if (booking && booking.status === BookingStatus.ACCEPTED) {
      const bookingWithCalEventResponses = {
        ...booking,
        responses: reqBody.calEventResponses,
      };
      for (const subscriber of subscribersMeetingEnded) {
        scheduleTriggerPromises.push(
          scheduleTrigger({
            booking: bookingWithCalEventResponses,
            subscriberUrl: subscriber.subscriberUrl,
            subscriber,
            triggerEvent: WebhookTriggerEvents.MEETING_ENDED,
            isDryRun,
          })
        );
      }

      for (const subscriber of subscribersMeetingStarted) {
        scheduleTriggerPromises.push(
          scheduleTrigger({
            booking: bookingWithCalEventResponses,
            subscriberUrl: subscriber.subscriberUrl,
            subscriber,
            triggerEvent: WebhookTriggerEvents.MEETING_STARTED,
            isDryRun,
          })
        );
      }
    }

    const scheduledTriggerResults = await Promise.allSettled([
      ...deleteWebhookScheduledTriggerPromises,
      ...scheduleTriggerPromises,
    ]);
    const failures = scheduledTriggerResults.filter((result) => result.status === "rejected");

    if (failures.length > 0) {
      tracingLogger.error(
        "Error while scheduling or canceling webhook triggers",
        safeStringify({
          errors: failures.map((f) => f.reason),
        })
      );
    }

    // Send Webhook call if hooked to BOOKING_CREATED & BOOKING_RESCHEDULED
    await handleWebhookTrigger({
      subscriberOptions,
      eventTrigger,
      webhookData,
      isDryRun,
      traceContext,
    });
  }

  if (!booking) throw new HttpError({ statusCode: 400, message: "Booking failed" });

  try {
    if (!isDryRun) {
      await deps.prismaClient.booking.update({
        where: {
          uid: booking.uid,
        },
        data: {
          location: evt.location,
          metadata: { ...(typeof booking.metadata === "object" && booking.metadata), ...metadata },
          references: {
            createMany: {
              data: referencesToCreate,
            },
          },
        },
      });
    }
  } catch (error) {
    tracingLogger.error("Error while creating booking references", JSON.stringify({ error }));
  }

  // Queue BOOKING_REQUESTED webhook after booking update so consumer fetches booking with location, metadata, references
  if (booking && booking.status === BookingStatus.PENDING && !isDryRun) {
    try {
      await deps.webhookProducer.queueBookingRequestedWebhook({
        bookingUid: booking.uid,
        userId: subscriberOptions.userId ?? undefined,
        eventTypeId: subscriberOptions.eventTypeId ?? undefined,
        teamId: Array.isArray(subscriberOptions.teamId)
          ? subscriberOptions.teamId[0]
          : (subscriberOptions.teamId ?? undefined),
        orgId: subscriberOptions.orgId ?? undefined,
        oAuthClientId: platformClientId ?? undefined,
      });
    } catch (webhookError) {
      tracingLogger.error(
        `Error queueing BOOKING_REQUESTED webhook: bookingId: ${booking.id}, bookingUid: ${booking.uid}`,
        safeStringify(webhookError)
      );
    }
  }

  const evtWithMetadata = {
    ...evt,
    rescheduleReason,
    metadata,
    eventType: { slug: eventType.slug, schedulingType: eventType.schedulingType, hosts: eventType.hosts },
    bookerUrl,
  };

  try {
    if (isConfirmedByDefault) {
      await scheduleNoShowTriggers({
        booking: {
          startTime: booking.startTime,
          id: booking.id,
          location: booking.location,
          uid: booking.uid,
        },
        triggerForUser: true,
        organizerUser: { id: organizerUser.id },
        eventTypeId,
        teamId: null,
        orgId: null,
        isDryRun,
      });
    }
  } catch (error) {
    tracingLogger.error("Error while scheduling no show triggers", JSON.stringify({ error }));
  }

  if (!isDryRun) {
    await handleAnalyticsEvents({
      credentials: allCredentials,
      rawBookingData,
      bookingInfo: {
        name: fullName,
        email: bookerEmail,
        eventName: "Cal.diy lead",
      },
      isTeamEventType,
    });

    // Unused until we deploy to trigger.dev production
    // for now we only enable for cal.com org and we keep our current email system
    // cal.com org members will see emails in double while we test
    if (ENABLE_ASYNC_TASKER && !noEmail && isBookingEmailSmsTaskerEnabled) {
      try {
        await deps.bookingEmailAndSmsTasker.send({
          action: bookingEmailsAndSmsTaskerAction,
          schedulingType: evtWithMetadata.eventType.schedulingType,
          payload: {
            bookingId: booking.id,
            conferenceCredentialId,
            platformClientId,
            platformRescheduleUrl,
            platformCancelUrl,
            platformBookingUrl,
            isRescheduledByBooker: reqBody.rescheduledBy === bookerEmail,
          },
        });
      } catch (err) {
        tracingLogger.error("bookingEmailAndSmsTasker error:", err);
      }
    }
  }

  // TODO: Refactor better so this booking object is not passed
  // all around and instead the individual fields are sent as args.
  const bookingResponse = {
    ...booking,
    user: {
      ...booking.user,
      email: null,
    },
    paymentRequired: false,
  };

  return {
    ...bookingResponse,
    ...luckyUserResponse,
    isDryRun,
    ...(isDryRun ? { troubleshooterData } : {}),
    references: referencesToCreate,
    seatReferenceUid: evt.attendeeSeatId,
    videoCallUrl: metadata?.videoCallUrl,
    previousBooking: originalRescheduledBooking
      ? {
          uid: originalRescheduledBooking.uid,
          startTime: originalRescheduledBooking.startTime,
          endTime: originalRescheduledBooking.endTime,
        }
      : null,
  };
}

/**
 * Takes care of creating/rescheduling non-recurring, non-instant bookings. Such bookings could be TeamBooking, UserBooking, SeatedUserBooking, SeatedTeamBooking, etc.
 * We can't name it CoreBookingService because non-instant booking also creates a booking but it is entirely different from the regular booking.
 * We are open to renaming it to something more descriptive.
 */
export class RegularBookingService implements IBookingService {
  constructor(private readonly deps: IBookingServiceDependencies) {}

  async fireBookingEvents({
    booking,
    organizerUser,
    hashedLink,
    isDryRun,
    bookerEmail,
    bookerName,
    originalRescheduledBooking,
    isRecurringBooking,
    tracingLogger,
  }: {
    booking: {
      id: number;
      uid: string;
      startTime: Date;
      endTime: Date;
      status: BookingStatus;
      userId: number | null;
      userUuid: string | null;
      userEmail: string | null;
    };
    organizerUser: { id: number; uuid: string };
    hashedLink: string | null;
    isDryRun: boolean;
    bookerEmail: string;
    bookerName: string;
    originalRescheduledBooking: BookingType | null;
    isRecurringBooking: boolean;
    tracingLogger: ReturnType<typeof distributedTracing.getTracingLogger>;
  }) {
    try {
      const bookingCreatedPayload = buildBookingCreatedPayload({
        booking,
        organizerUserId: organizerUser.id,
        organizerUserUuid: organizerUser.uuid,
        hashedLink,
        isDryRun,
      });

      const bookingEventHandler = this.deps.bookingEventHandler;

      if (!isRecurringBooking) {
        if (originalRescheduledBooking) {
          const bookingRescheduledPayload: BookingRescheduledPayload = {
            ...bookingCreatedPayload,
            oldBooking: {
              uid: originalRescheduledBooking.uid,
              startTime: originalRescheduledBooking.startTime,
              endTime: originalRescheduledBooking.endTime,
            },
          };
          await bookingEventHandler.onBookingRescheduled({
            payload: bookingRescheduledPayload,
          });
        } else {
          await bookingEventHandler.onBookingCreated({
            payload: bookingCreatedPayload,
          });
        }
      }
    } catch (error) {
      tracingLogger.error("Error while firing booking events", safeStringify(error));
    }
  }

  async createBooking(input: { bookingData: CreateRegularBookingData; bookingMeta?: CreateBookingMeta }) {
    return handler.bind(this)(
      {
        bookingData: input.bookingData,
        ...input.bookingMeta,
      },
      this.deps
    );
  }

  async rescheduleBooking(input: { bookingData: CreateRegularBookingData; bookingMeta?: CreateBookingMeta }) {
    return handler.bind(this)(
      {
        bookingData: input.bookingData,
        ...input.bookingMeta,
      },
      this.deps
    );
  }

  /**
   * @deprecated Exists only till API v1 is removed.
   */
  async createBookingForApiV1(input: {
    bookingData: CreateRegularBookingData;
    bookingMeta?: CreateBookingMeta;
    bookingDataSchemaGetter: BookingDataSchemaGetter;
  }) {
    return handler.bind(this)(
      {
        bookingData: input.bookingData,
        ...input.bookingMeta,
      },
      this.deps,
      input.bookingDataSchemaGetter
    );
  }
}
