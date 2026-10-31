import type {
  CalVideoSettings,
  ChildInput,
  DestinationCalendarInput,
  EventTypeUpdateInput,
  HashedLinkInput,
  HostGroupInput,
  HostInput,
} from "@calcom/features/eventtypes/lib/types";
import { MAX_SEATS_PER_TIME_SLOT } from "@calcom/lib/constants";
import {
  customInputSchema,
  EventTypeMetaDataSchema,
  eventTypeBookingFields,
  eventTypeColor,
  eventTypeLocations,
  intervalLimitsType,
  recurringEventType,
  rrSegmentQueryValueSchema,
} from "@calcom/prisma/zod-utils";
import { z } from "zod";
import {DisableCancelling} from "@calcom/prisma/enums";

export type TUpdateInputSchema = EventTypeUpdateInput;

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

const hashedLinkInputSchema: z.ZodType<HashedLinkInput> = z
  .object({
    link: z.string(),
    expiresAt: z.date().nullish(),
    maxUsageCount: z.number().nullish(),
    usageCount: z.number().nullish(),
  })
  .strict();

const calVideoSettingsSchema: z.ZodType<CalVideoSettings | undefined> = z
  .object({
    disableRecordingForGuests: z.boolean().nullish(),
    disableRecordingForOrganizer: z.boolean().nullish(),
    enableAutomaticTranscription: z.boolean().nullish(),
    enableAutomaticRecordingForOrganizer: z.boolean().nullish(),
    disableTranscriptionForGuests: z.boolean().nullish(),
    disableTranscriptionForOrganizer: z.boolean().nullish(),
    redirectUrlOnExit: z.string().url().nullish(),
    requireEmailForGuests: z.boolean().nullish(),
  })
  .optional()
  .nullable();

const hostLocationSchema = z.object({
  id: z.string().optional(),
  userId: z.number(),
  eventTypeId: z.number(),
  type: z.string(),
  credentialId: z.number().optional().nullable(),
  link: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  phoneNumber: z.string().optional().nullable(),
});

const hostSchema: z.ZodType<HostInput> = z.object({
  userId: z.number(),
  profileId: z.number().or(z.null()).optional(),
  isFixed: z.boolean().optional(),
  priority: z.number().min(0).max(4).optional().nullable(),
  weight: z.number().min(0).optional().nullable(),
  scheduleId: z.number().optional().nullable(),
  groupId: z.string().optional().nullable(),
  location: hostLocationSchema.optional().nullable(),
});

const hostGroupSchema: z.ZodType<HostGroupInput> = z.object({
  id: z.string().uuid(),
  name: z.string(),
});

const childSchema: z.ZodType<ChildInput> = z.object({
  owner: z.object({
    id: z.number(),
    name: z.string(),
    email: z.string(),
    eventTypeSlugs: z.array(z.string()),
  }),
  hidden: z.boolean(),
});

const destinationCalendarInputSchema: z.ZodType<DestinationCalendarInput> = z
  .object({
    integration: z.string(),
    externalId: z.string(),
  })
  .nullable();

/**
 * Base schema for event type updates.
 *
 * Uses z.ZodType<TUpdateInputSchema> annotation to prevent TypeScript from
 * inferring the complex type through the schema chain. This is a key
 * optimization that reduces type-checking time significantly.
 */
const BaseEventTypeUpdateInput: z.ZodType<TUpdateInputSchema> = z
  .object({
    // Required field
    id: z.number().int(),

    // Fields from EventTypeSchema
    periodType: z.enum(["UNLIMITED", "ROLLING", "ROLLING_WINDOW", "RANGE"]).optional(),
    schedulingType: z.enum(["ROUND_ROBIN", "COLLECTIVE", "MANAGED"]).nullable().optional(),
    title: z.string().min(1).optional(),
    slug: z.string().optional(),
    description: z.string().nullable().optional(),
    interfaceLanguage: z.string().nullable().optional(),
    position: z.number().int().optional(),
    locations: eventTypeLocations.nullable().optional(),
    length: z.number().min(1).optional(),
    offsetStart: z.number().int().optional(),
    hidden: z.boolean().optional(),
    userId: z.number().int().nullable().optional(),
    profileId: z.number().int().nullable().optional(),
    teamId: z.number().int().nullable().optional(),
    useEventLevelSelectedCalendars: z.boolean().optional(),
    eventName: z.string().nullable().optional(),
    parentId: z.number().int().nullable().optional(),
    bookingFields: eventTypeBookingFields.nullable().optional(),
    timeZone: z.string().nullable().optional(),
    periodStartDate: z.coerce.date().nullable().optional(),
    periodEndDate: z.coerce.date().nullable().optional(),
    periodDays: z.number().int().nullable().optional(),
    periodCountCalendarDays: z.boolean().nullable().optional(),
    lockTimeZoneToggleOnBookingPage: z.boolean().optional(),
    lockedTimeZone: z.string().nullable().optional(),
    requiresConfirmation: z.boolean().optional(),
    requiresConfirmationWillBlockSlot: z.boolean().optional(),
    requiresConfirmationForFreeEmail: z.boolean().optional(),
    requiresBookerEmailVerification: z.boolean().optional(),
    canSendCalVideoTranscriptionEmails: z.boolean().optional(),
    autoTranslateDescriptionEnabled: z.boolean().optional(),
    autoTranslateInstantMeetingTitleEnabled: z.boolean().optional(),
    recurringEvent: recurringEventType.nullable().optional(),
    disableGuests: z.boolean().optional(),
    hideCalendarNotes: z.boolean().optional(),
    hideCalendarEventDetails: z.boolean().optional(),
    minimumBookingNotice: z.number().min(0).optional(),
    beforeEventBuffer: z.number().int().optional(),
    afterEventBuffer: z.number().int().optional(),
    seatsPerTimeSlot: z.number().min(1).max(MAX_SEATS_PER_TIME_SLOT).nullable().optional(),
    onlyShowFirstAvailableSlot: z.boolean().optional(),
    showOptimizedSlots: z.boolean().nullable().optional(),
    disableCancelling: z
      .enum([
        DisableCancelling.NOBODY,
        DisableCancelling.GUESTS,
        DisableCancelling.BOTH_HOST_GUESTS,
      ])
      .nullable()
      .optional(),
    disableRescheduling: z.boolean().nullable().optional(),
    requiresCancellationReason: z
      .enum(["MANDATORY_BOTH", "MANDATORY_HOST_ONLY", "MANDATORY_ATTENDEE_ONLY", "OPTIONAL_BOTH"])
      .nullable()
      .optional(),
    minimumRescheduleNotice: z.number().min(0).nullable().optional(),
    seatsShowAttendees: z.boolean().nullable().optional(),
    seatsShowAvailabilityCount: z.boolean().nullable().optional(),
    scheduleId: z.number().int().nullable().optional(),
    allowReschedulingCancelledBookings: z.boolean().nullable().optional(),
    price: z.number().int().optional(),
    currency: z.string().optional(),
    slotInterval: z.number().int().nullable().optional(),
    metadata: EventTypeMetaDataSchema.optional(),
    successRedirectUrl: z.string().nullable().optional(),
    forwardParamsSuccessRedirect: z.boolean().nullable().optional(),
    bookingLimits: intervalLimitsType.nullable().optional(),
    durationLimits: intervalLimitsType.nullable().optional(),
    isInstantEvent: z.boolean().optional(),
    instantMeetingExpiryTimeOffsetInSeconds: z.number().int().optional(),
    instantMeetingScheduleId: z.number().int().nullable().optional(),
    instantMeetingParameters: z.string().array().optional(),
    assignAllTeamMembers: z.boolean().optional(),
    assignRRMembersUsingSegment: z.boolean().optional(),
    rrSegmentQueryValue: rrSegmentQueryValueSchema.nullable().optional(),
    useEventTypeDestinationCalendarEmail: z.boolean().optional(),
    isRRWeightsEnabled: z.boolean().optional(),
    maxLeadThreshold: z.number().int().nullable().optional(),
    includeNoShowInRRCalculation: z.boolean().optional(),
    allowReschedulingPastBookings: z.boolean().optional(),
    hideOrganizerEmail: z.boolean().optional(),
    maxActiveBookingsPerBooker: z.number().int().nullable().optional(),
    maxActiveBookingPerBookerOfferReschedule: z.boolean().optional(),
    customReplyToEmail: z.string().nullable().optional(),
    eventTypeColor: eventTypeColor.nullable().optional(),
    rescheduleWithSameRoundRobinHost: z.boolean().optional(),
    secondaryEmailId: z.number().int().nullable().optional(),
    useBookerTimezone: z.boolean().optional(),
    restrictionScheduleId: z.number().int().nullable().optional(),
    bookingRequiresAuthentication: z.boolean().optional(),
    rrHostSubsetEnabled: z.boolean().optional(),
    createdAt: z.coerce.date().nullable().optional(),
    updatedAt: z.coerce.date().nullable().optional(),

    // Extended fields
    calVideoSettings: calVideoSettingsSchema,
    customInputs: z.array(customInputSchema).optional(),
    destinationCalendar: destinationCalendarInputSchema.optional(),
    users: z.array(z.number()).optional(),
    children: z.array(childSchema).optional(),
    hosts: z.array(hostSchema).optional(),
    schedule: z.number().nullable().optional(),
    instantMeetingSchedule: z.number().nullable().optional(),
    multiplePrivateLinks: z.array(z.union([z.string(), hashedLinkInputSchema])).optional(),
    hostGroups: z.array(hostGroupSchema).optional(),
    enablePerHostLocations: z.boolean().optional(),
  })
  .strict();

export const ZUpdateInputSchema = BaseEventTypeUpdateInput;
