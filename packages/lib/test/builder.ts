import getICalUID from "@calcom/emails/lib/getICalUID";
import { WebhookVersion } from "@calcom/features/webhooks/lib/interface/IWebhookRepository";
import type { Booking, BookingReference, EventType, Prisma, Webhook } from "@calcom/prisma/client";
import { BookingStatus, CreationSource } from "@calcom/prisma/enums";
import type { CalendarEvent, Person, VideoCallData } from "@calcom/types/Calendar";
import { faker } from "@faker-js/faker";
import type { TFunction } from "i18next";

export const buildVideoCallData = (callData?: Partial<VideoCallData>): VideoCallData => {
  return {
    type: faker.helpers.arrayElement(["zoom_video", "stream_video"]),
    id: faker.datatype.uuid(),
    password: faker.internet.password(),
    url: faker.internet.url(),
    ...callData,
  };
};

export const buildPerson = (person?: Partial<Person>): Person => {
  return {
    name: faker.name.firstName(),
    email: faker.internet.email(),
    timeZone: faker.address.timeZone(),
    username: faker.internet.userName(),
    id: faker.datatype.number(),
    language: {
      locale: faker.random.locale(),
      translate: ((key: string) => key) as TFunction,
    },
    ...person,
  };
};

export const buildBooking = (
  booking?: Partial<Booking> & { references?: Partial<BookingReference>[] }
): Booking & { references?: Partial<BookingReference>[]; attendees?: [] } => {
  const uid = faker.datatype.uuid();
  return {
    id: faker.datatype.number(),
    uid,
    userId: null,
    eventTypeId: null,
    idempotencyKey: null,
    userPrimaryEmail: null,
    title: faker.lorem.sentence(),
    description: faker.lorem.paragraph(),
    customInputs: null,
    startTime: faker.date.future(),
    endTime: faker.date.future(),
    location: null,
    createdAt: new Date(),
    updatedAt: null,
    status: BookingStatus.ACCEPTED,
    paid: false,
    destinationCalendarId: null,
    cancelledBy: null,
    rescheduledBy: null,
    cancellationReason: null,
    reassignReason: null,
    rejectionReason: null,
    dynamicEventSlugRef: null,
    dynamicGroupSlugRef: null,
    rescheduled: null,
    fromReschedule: null,
    recurringEventId: null,
    smsReminderNumber: null,
    reassignById: null,
    scheduledJobs: [],
    metadata: null,
    responses: null,
    isRecorded: false,
    iCalUID: getICalUID({ uid }),
    iCalSequence: 0,
    rating: null,
    noShowHost: null,
    ratingFeedback: null,
    attendees: [],
    oneTimePassword: null,
    creationSource: CreationSource.WEBAPP,
    ...booking,
    rootBookingUid: booking?.rootBookingUid ?? booking?.uid ?? uid,
  };
};

export const buildEventType = (eventType?: Partial<EventType>): EventType => {
  return {
    id: faker.datatype.number(),
    title: faker.lorem.sentence(),
    slug: faker.lorem.slug(),
    description: faker.lorem.paragraph(),
    interfaceLanguage: null,
    position: 1,
    isInstantEvent: false,
    instantMeetingParameters: [],
    instantMeetingExpiryTimeOffsetInSeconds: 90,
    instantMeetingScheduleId: null,
    locations: null,
    length: 15,
    offsetStart: 0,
    hidden: false,
    userId: null,
    teamId: null,
    requiresBookerEmailVerification: false,
    canSendCalVideoTranscriptionEmails: true,
    useEventTypeDestinationCalendarEmail: false,
    eventName: faker.lorem.words(),
    timeZone: null,
    periodType: "UNLIMITED",
    periodStartDate: null,
    periodEndDate: null,
    periodDays: null,
    periodCountCalendarDays: null,
    recurringEvent: null,
    lockTimeZoneToggleOnBookingPage: false,
    lockedTimeZone: null,
    requiresConfirmation: false,
    requiresConfirmationForFreeEmail: false,
    requiresConfirmationWillBlockSlot: false,
    disableGuests: false,
    hideCalendarNotes: false,
    hideCalendarEventDetails: false,
    minimumBookingNotice: 120,
    beforeEventBuffer: 0,
    afterEventBuffer: 0,
    onlyShowFirstAvailableSlot: false,
    showOptimizedSlots: false,
    seatsPerTimeSlot: null,
    seatsShowAttendees: null,
    disableCancelling: false,
    disableRescheduling: false,
    minimumRescheduleNotice: null,
    allowReschedulingCancelledBookings: false,
    seatsShowAvailabilityCount: null,
    maxLeadThreshold: null,
    includeNoShowInRRCalculation: false,
    schedulingType: null,
    scheduleId: null,
    bookingLimits: null,
    maxActiveBookingsPerBooker: null,
    maxActiveBookingPerBookerOfferReschedule: false,
    durationLimits: null,
    assignAllTeamMembers: false,
    rescheduleWithSameRoundRobinHost: false,
    price: 0,
    currency: "usd",
    slotInterval: null,
    metadata: null,
    successRedirectUrl: null,
    forwardParamsSuccessRedirect: true,
    bookingFields: [],
    parentId: null,
    profileId: null,
    secondaryEmailId: null,
    isRRWeightsEnabled: false,
    eventTypeColor: null,
    assignRRMembersUsingSegment: false,
    rrSegmentQueryValue: null,
    autoTranslateDescriptionEnabled: false,
    autoTranslateInstantMeetingTitleEnabled: true,
    useEventLevelSelectedCalendars: false,
    allowReschedulingPastBookings: false,
    hideOrganizerEmail: false,
    customReplyToEmail: null,
    restrictionScheduleId: null,
    useBookerTimezone: false,
    bookingRequiresAuthentication: false,
    createdAt: null,
    updatedAt: null,
    rrHostSubsetEnabled: false,
    requiresCancellationReason: null,
    enablePerHostLocations: false,
    ...eventType,
  };
};

export const buildWebhook = (webhook?: Partial<Webhook>): Webhook => {
  return {
    id: faker.datatype.uuid(),
    eventTypeId: faker.datatype.number(),
    subscriberUrl: "http://mockedURL.com",
    payloadTemplate: null,
    createdAt: faker.datatype.datetime(),
    appId: null,
    userId: null,
    secret: faker.lorem.slug(),
    active: true,
    eventTriggers: [],
    teamId: null,
    platformOAuthClientId: null,
    time: null,
    timeUnit: null,
    version: WebhookVersion.V_2021_10_20,
    ...webhook,
    platform: false,
  };
};

export const buildSubscriberEvent = (booking?: Partial<Booking>) => {
  return {
    type: booking?.title || "",
    title: booking?.title,
    description: "",
    additionalNotes: "",
    customInputs: {},
    startTime: booking?.startTime,
    endTime: booking?.endTime,
    organizer: {
      name: "",
      email: "",
      timeZone: "",
      language: {
        locale: "en",
      },
    },
    attendees: [],
    location: "",
    destinationCalendar: null,
    hideCalendar: false,
    uid: booking?.uid,
    metadata: {},
  };
};

export const buildCalendarEvent = (
  event?: Partial<CalendarEvent>,
  omitVideoCallData?: boolean
): CalendarEvent => {
  const uid = faker.datatype.uuid();
  return {
    uid,
    iCalUID: getICalUID({ uid }),
    type: faker.helpers.arrayElement(["event", "meeting"]),
    title: faker.lorem.sentence(),
    startTime: faker.date.future().toISOString(),
    endTime: faker.date.future().toISOString(),
    location: faker.address.city(),
    description: faker.lorem.paragraph(),
    attendees: [],
    customInputs: {},
    additionalNotes: faker.lorem.paragraph(),
    organizer: buildPerson(),
    ...(!omitVideoCallData && { videoCallData: buildVideoCallData() }),
    ...event,
  };
};

type UserPayload = Prisma.UserGetPayload<{
  select: {
    locked: true;
    name: true;
    email: true;
    timeZone: true;
    username: true;
    id: true;
    allowDynamicBooking: true;
    credentials: true;
    destinationCalendar: true;
    availability: true;
    selectedCalendars: true;
    schedules: true;
    avatarUrl: true;
    backupCodes: true;
    bio: true;
    brandColor: true;
    completedOnboarding: true;
    createdDate: true;
    bufferTime: true;
    darkBrandColor: true;
    defaultScheduleId: true;
    emailVerified: true;
    hideBranding: true;
    identityProvider: true;
    identityProviderId: true;
    invitedTo: true;
    locale: true;
    metadata: true;
    role: true;
    theme: true;
    appTheme: true;
    timeFormat: true;
    trialEndsAt: true;
    twoFactorEnabled: true;
    twoFactorSecret: true;
    verified: true;
    weekStart: true;
    organizationId: true;
    allowSEOIndexing: true;
    receiveMonthlyDigestEmail: true;
    movedToProfileId: true;
    isPlatformManaged: true;
    smsLockState: true;
  };
}>;
export const buildUser = <T extends Partial<UserPayload>>(
  user?: T & { priority?: number; weight?: number }
): UserPayload & { priority: number; weight: number } => {
  return {
    locked: false,
    smsLockState: "UNLOCKED",
    name: faker.name.firstName(),
    email: faker.internet.email(),
    timeZone: faker.address.timeZone(),
    username: faker.internet.userName(),
    id: 0,
    allowDynamicBooking: true,
    availability: [],
    avatarUrl: "",
    backupCodes: null,
    bio: null,
    brandColor: "#292929",
    bufferTime: 0,
    completedOnboarding: false,
    createdDate: new Date(),
    credentials: [],
    darkBrandColor: "#fafafa",
    defaultScheduleId: null,
    destinationCalendar: null,
    emailVerified: null,
    hideBranding: true,
    identityProvider: "CAL",
    identityProviderId: null,
    invitedTo: null,
    locale: "en",
    metadata: null,
    role: "USER",
    schedules: [],
    selectedCalendars: [],
    theme: null,
    appTheme: null,
    timeFormat: null,
    trialEndsAt: null,
    twoFactorEnabled: false,
    twoFactorSecret: null,
    verified: false,
    weekStart: "",
    organizationId: null,
    allowSEOIndexing: null,
    receiveMonthlyDigestEmail: null,
    movedToProfileId: null,
    priority: user?.priority ?? 2,
    weight: user?.weight ?? 100,
    isPlatformManaged: false,
    ...user,
  };
};
