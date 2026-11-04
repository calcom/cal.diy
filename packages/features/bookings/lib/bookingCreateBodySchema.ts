// `responses` is merged with it during handleNewBooking call because `responses` schema is dynamic and depends on eventType
import z from "zod";

import { timeZoneSchema } from "@calcom/lib/dayjs/timeZone.schema";

import { CreationSource } from "@calcom/prisma/enums";

export const bookingCreateBodySchema = z.object({
  end: z.string().optional(),
  eventTypeId: z.number(),
  eventTypeSlug: z.string().optional(),
  rescheduleUid: z.string().optional(),
  recurringEventId: z.string().optional(),
  rescheduledBy: z.string().email({ message: "Invalid email" }).optional(),
  start: z.string(),
  timeZone: timeZoneSchema,
  user: z.union([z.string(), z.array(z.string())]).optional(),
  language: z.string(),
  bookingUid: z.string().optional(),
  metadata: z.record(z.string()),
  hasHashedBookingLink: z.boolean().optional(),
  hashedLink: z.string().nullish(),
  seatReferenceUid: z.string().optional(),
  orgSlug: z.string().optional(),
  teamMemberEmail: z.string().nullish(),
  crmOwnerRecordType: z.string().nullish(),
  crmRecordId: z.string().nullish(),
  routedTeamMemberIds: z.array(z.number()).nullish(),
  skipContactOwner: z.boolean().optional(),
  /**
   * When true, bypasses requiresConfirmation on the event type and sets the booking status to ACCEPTED directly.
   * Useful for API/programmatic bookings where the organizer wants to skip the confirmation queue.
   */
  forceConfirm: z.boolean().optional(),
  rrHostSubsetIds: z.array(z.number()).nullish(),
  crmAppSlug: z.string().nullish().optional(),
  cfToken: z.string().nullish().optional(),

  /**
   * Used to identify if the booking is a dry run.
   */
  _isDryRun: z.boolean().optional(),
  tracking: z
    .object({
      utm_source: z.string().optional(),
      utm_medium: z.string().optional(),
      utm_campaign: z.string().optional(),
      utm_term: z.string().optional(),
      utm_content: z.string().optional(),
    })
    .optional(),
  dub_id: z.string().nullish(),
  creationSource: z.nativeEnum(CreationSource).optional(),
  verificationCode: z.string().optional(),
});

export type BookingCreateBody = z.input<typeof bookingCreateBodySchema>;

// TODO: Plan to create different schemas for Recurring Bookings, Instant Bookings and Regular Bookings.
// We later want to make these properties required. They were optional because they are part of general schema which is used for all types of bookings.
const recurringBookingCreateBodyPartialSchema = z.object({
  recurringCount: z.number().optional(),
  isFirstRecurringSlot: z.boolean().optional(),
  thirdPartyRecurringEventId: z.string().nullish(),
  numSlotsToCheckForAvailability: z.number().optional(),
  allRecurringDates: z
    .array(
      z.object({
        start: z.string(),
        end: z.string().optional(),
      })
    )
    .optional(),
  currentRecurringIndex: z.number().optional(),
});

export const extendedBookingCreateBody = bookingCreateBodySchema.merge(
  z
    .object({
      noEmail: z.boolean().optional(),
      appsStatus: z
        .array(
          z.object({
            appName: z.string(),
            success: z.number(),
            failures: z.number(),
            type: z.string(),
            errors: z.string().array(),
            warnings: z.string().array().optional(),
          })
        )
        .optional(),
      luckyUsers: z.array(z.number()).optional(),
      customInputs: z.undefined().optional(),
    })
    .merge(recurringBookingCreateBodyPartialSchema)
);

export type ExtendedBookingCreateBody = z.input<typeof extendedBookingCreateBody>;

// It has only the legacy props that are part of `responses` now. The API can still hit old props
export const bookingCreateSchemaLegacyPropsForApi = z.object({
  email: z.string(),
  name: z.string(),
  guests: z.array(z.string()).optional(),
  notes: z.string().optional(),
  location: z.string(),
  smsReminderNumber: z.string().optional().nullable(),
  rescheduleReason: z.string().optional(),
  customInputs: z.array(z.object({ label: z.string(), value: z.union([z.string(), z.boolean()]) })),
});

// This is the schema that is used for the API. It has all the legacy props that are part of `responses` now.
export const bookingCreateBodySchemaForApi = extendedBookingCreateBody.merge(
  bookingCreateSchemaLegacyPropsForApi.partial()
);
