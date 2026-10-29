import type { UnitTypeLongPlural } from "dayjs";
import type { TFunction } from "i18next";
import type {
  AnyZodObject,
  objectInputType,
  objectOutputType,
  ZodNullableDef,
  ZodOptionalDef,
  ZodRawShape,
  ZodTypeAny,
} from "zod";
import z, { ZodNullable, ZodObject, ZodOptional } from "zod";
import type { Prisma } from "./client";
import { EventTypeCustomInputType } from "./enums";

/** @see https://github.com/colinhacks/zod/issues/3155#issuecomment-2060045794 */
export const emailRegex =
  /* eslint-disable-next-line no-useless-escape */
  /^(?!\.)(?!.*\.\.)([A-Z0-9_+-.']*)[A-Z0-9_+'-]@([A-Z0-9][A-Z0-9-]*\.)+[A-Z]{2,}$/i;

/**
 * RFC 5321 Section 4.5.3.1.3 specifies:
 * - Maximum email address length: 254 characters
 * - Local part (before @): max 64 characters
 * - Domain part (after @): max 253 characters
 */
const MAX_EMAIL_LENGTH = 254;

const emailRegexSchema = z
  .string()
  .max(MAX_EMAIL_LENGTH, { message: "Email address is too long" })
  .regex(emailRegex);

const getValidRhfFieldName = (fieldName: string) => {
  // Remember that any transformation that you do here would run on System Field names as well. So, be careful and avoiding doing anything here that would modify the SystemField names.
  // e.g. SystemField name currently have uppercases in them. So, no need to lowercase unless absolutely needed.
  return fieldName.replace(/[^a-zA-Z0-9-_]/g, "-");
};

function isPasswordValid(password: string): boolean;
function isPasswordValid(
  password: string,
  breakdown: boolean,
  strict?: boolean
): { caplow: boolean; num: boolean; min: boolean; admin_min: boolean };
function isPasswordValid(password: string, breakdown?: boolean, strict?: boolean) {
  let cap = false, // Has uppercase characters
    low = false, // Has lowercase characters
    num = false, // At least one number
    min = false, // Eight characters, or fifteen in strict mode.
    admin_min = false;
  if (password.length >= 7 && (!strict || password.length > 14)) min = true;
  if (strict && password.length > 14) admin_min = true;
  if (password.match(/\d/)) num = true;
  if (password.match(/[a-z]/)) low = true;
  if (password.match(/[A-Z]/)) cap = true;

  if (!breakdown) return cap && low && num && min && (strict ? admin_min : true);

  let errors: Record<string, boolean> = { caplow: cap && low, num, min };
  // Only return the admin key if strict mode is enabled.
  if (strict) errors = { ...errors, admin_min };

  return errors;
}

export type IntervalLimitUnit = "day" | "week" | "month" | "year";
export type IntervalLimit = Partial<Record<`PER_${Uppercase<IntervalLimitUnit>}`, number | undefined>>;
export type IntervalLimitKey = keyof IntervalLimit;

export const intervalLimitsType: z.Schema<IntervalLimit | null> = z
  .object({
    PER_DAY: z.number().optional(),
    PER_WEEK: z.number().optional(),
    PER_MONTH: z.number().optional(),
    PER_YEAR: z.number().optional(),
  })
  .nullable();

// Let's not import 118kb just to get an enum
export enum Frequency {
  YEARLY = 0,
  MONTHLY = 1,
  WEEKLY = 2,
  DAILY = 3,
  HOURLY = 4,
  MINUTELY = 5,
  SECONDLY = 6,
}

export enum BookerLayouts {
  MONTH_VIEW = "month_view",
  WEEK_VIEW = "week_view",
  COLUMN_VIEW = "column_view",
}

export const bookerLayoutOptions = [
  BookerLayouts.MONTH_VIEW,
  BookerLayouts.WEEK_VIEW,
  BookerLayouts.COLUMN_VIEW,
];

const layoutOptions = z.union([
  z.literal(bookerLayoutOptions[0]),
  z.literal(bookerLayoutOptions[1]),
  z.literal(bookerLayoutOptions[2]),
]);

export const bookerLayouts = z
  .object({
    enabledLayouts: z.array(layoutOptions),
    defaultLayout: layoutOptions,
  })
  .nullable();

export const orgOnboardingInvitedMembersSchema = z.array(
  z.object({
    email: z.string().email(),
    name: z.string().optional(),
    teamId: z.number().optional(),
    teamName: z.string().optional(),
    role: z.enum(["MEMBER", "ADMIN"]).optional().default("MEMBER"),
  })
);

export const orgOnboardingTeamsSchema = z.array(
  z.object({
    id: z.number(),
    name: z.string(),
    isBeingMigrated: z.boolean(),
    // "slug" is null for new teams
    slug: z.string().nullable(),
  })
);

export const defaultBookerLayoutSettings = {
  defaultLayout: BookerLayouts.MONTH_VIEW,
  // if the user has no explicit layouts set (not in user profile and not in event settings), all layouts are enabled.
  enabledLayouts: bookerLayoutOptions,
};

export type BookerLayoutSettings = z.infer<typeof bookerLayouts>;

export const RequiresConfirmationThresholdUnits: z.ZodType<UnitTypeLongPlural> = z.enum(["hours", "minutes"]);

const _eventTypeMetaDataSchemaWithoutApps = z.object({
  smartContractAddress: z.string().optional(),
  blockchainId: z.number().optional(),
  multipleDuration: z.number().array().optional(),
  hideDurationSelectorInBookingPage: z.boolean().optional(),
  giphyThankYouPage: z.string().optional(),
  additionalNotesRequired: z.boolean().optional(),
  disableSuccessPage: z.boolean().optional(),
  disableStandardEmails: z
    .object({
      all: z
        .object({
          host: z.boolean().optional(),
          attendee: z.boolean().optional(),
        })
        .optional(),
      confirmation: z
        .object({
          host: z.boolean().optional(),
          attendee: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
  managedEventConfig: z
    .object({
      unlockedFields: z.custom<{ [k in keyof Omit<Prisma.EventTypeSelect, "id">]: true }>().optional(),
    })
    .optional(),
  requiresConfirmationThreshold: z
    .object({
      time: z.number(),
      unit: RequiresConfirmationThresholdUnits,
    })
    .optional(),
  config: z
    .object({
      useHostSchedulesForTeamEvent: z.boolean().optional(),
    })
    .optional(),
  bookerLayouts: bookerLayouts.optional(),
});

export const eventTypeMetaDataSchemaWithUntypedApps = _eventTypeMetaDataSchemaWithoutApps.merge(
  z.object({
    apps: z.record(z.string(), z.any()).optional(),
  })
);

export const EventTypeMetaDataSchema = eventTypeMetaDataSchemaWithUntypedApps.nullable();
export const eventTypeMetaDataSchemaWithoutApps = _eventTypeMetaDataSchemaWithoutApps.nullable();

export type EventTypeMetadata = z.infer<typeof EventTypeMetaDataSchema>;

// Validation of user added bookingFields' responses happen using `getBookingResponsesSchema` which requires `eventType`.
// So it is a dynamic validation and thus entire validation can't exist here
// Note that this validation runs to validate prefill params as well, so it should consider that partial values can be there. e.g. `name` might be empty string
export const bookingResponses = z
  .object({
    email: z.string(),
    attendeePhoneNumber: z.string().optional(),
    //TODO: Why don't we move name out of bookingResponses and let it be handled like user fields?
    name: z.union([
      z.string(),
      z.object({
        firstName: z.string(),
        lastName: z.string().optional(),
      }),
    ]),
    guests: z.array(z.string()).optional(),
    notes: z.string().optional(),
    location: z
      .object({
        optionValue: z.string(),
        value: z.string(),
      })
      .optional(),
    smsReminderNumber: z.string().optional(),
    rescheduleReason: z.string().optional(),
  })
  .nullable();

export type BookingResponses = z.infer<typeof bookingResponses>;

// Re-exported from @calcom/lib/zod/eventType for backwards compatibility
export { type EventTypeLocation, eventTypeLocations } from "@calcom/lib/zod/eventType";

// Matching RRule.Options: rrule/dist/esm/src/types.d.ts
export const recurringEventType = z
  .object({
    dtstart: z.date().optional(),
    interval: z.number(),
    count: z.number(),
    freq: z.nativeEnum(Frequency),
    until: z.date().optional(),
    tzid: z.string().optional(),
  })
  .nullable();

// dayjs iso parsing is very buggy - cant use :( - turns ISO string into Date object
export const iso8601 = z.string().transform((val, ctx) => {
  const time = Date.parse(val);
  if (!time) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Invalid ISO Date",
    });
  }
  const d = new Date();
  d.setTime(time);
  return d;
});

export const eventTypeColor = z
  .object({
    lightEventTypeColor: z.string(),
    darkEventTypeColor: z.string(),
  })
  .nullable();

export type IntervalLimitsType = IntervalLimit | null;

// Re-exported from @calcom/lib/zod/eventType for backwards compatibility
export { eventTypeSlug } from "@calcom/lib/zod/eventType";

export const stringToDate = z.string().transform((a) => new Date(a));

export const stringOrNumber = z.union([
  z.string().transform((v, ctx) => {
    const parsed = parseInt(v);
    if (isNaN(parsed)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Not a number",
      });
    }
    return parsed;
  }),
  z.number().int(),
]);

export const requiredCustomInputSchema = z.union([
  // string must be given & nonempty
  z
    .string()
    .trim()
    .min(1),
  // boolean must be true if set.
  z
    .boolean()
    .refine((v) => v === true),
]);

const PlatformClientParamsSchema = z.object({
  platformClientId: z.string().optional(),
  platformRescheduleUrl: z.string().nullable().optional(),
  platformCancelUrl: z.string().nullable().optional(),
  platformBookingUrl: z.string().nullable().optional(),
  platformBookingLocation: z.string().optional(),
  areCalendarEventsEnabled: z.boolean().optional(),
});

export type PlatformClientParams = z.infer<typeof PlatformClientParamsSchema>;

export const bookingConfirmPatchBodySchema = z.object({
  bookingId: z.number(),
  confirmed: z.boolean(),
  recurringEventId: z.string().optional(),
  reason: z.string().optional(),
  emailsEnabled: z.boolean().default(true),
  platformClientParams: PlatformClientParamsSchema.optional(),
  actionSource: z.string().optional(),
  actor: z.unknown().optional(),
});

export const bookingCancelSchema = z.object({
  id: z.number().optional(),
  uid: z.string().optional(),
  // note(Lauris): allRemainingBookings will cancel all bookings that have start time greater than this moment.
  allRemainingBookings: z.boolean().optional(),
  // note(Lauris): cancelSubsequentBookings will cancel all bookings after one specified by id or uid.
  cancelSubsequentBookings: z.boolean().optional(),
  cancellationReason: z.string().optional(),
  skipCancellationReasonValidation: z.boolean().optional(),
  skipCalendarSyncTaskCancellation: z.boolean().optional(),
  seatReferenceUid: z.string().optional(),
  cancelledBy: z.string().email({ message: "Invalid email" }).optional(),
  internalNote: z
    .object({
      id: z.number(),
      name: z.string(),
      cancellationReason: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
});

export const bookingCancelAttendeeSeatSchema = z.object({
  seatReferenceUid: z.string(),
});

export const bookingCancelInput = bookingCancelSchema.refine(
  (data) => !!data.id || !!data.uid,
  "At least one of the following required: 'id', 'uid'."
);

export const bookingCancelWithCsrfSchema = bookingCancelSchema
  .extend({
    csrfToken: z.string().length(64, "Invalid CSRF token"),
  })
  .refine((data) => !!data.id || !!data.uid, "At least one of the following required: 'id', 'uid'.");

export const vitalSettingsUpdateSchema = z.object({
  connected: z.boolean().optional(),
  selectedParam: z.string().optional(),
  sleepValue: z.number().optional(),
});

export const createdEventSchema = z
  .object({
    id: z.string(),
    thirdPartyRecurringEventId: z.string(),
    password: z.union([z.string(), z.undefined()]),
    onlineMeetingUrl: z.string().nullable(),
    iCalUID: z.string().optional(),
  })
  .passthrough();

const schemaDefaultConferencingApp = z.object({
  appSlug: z.string().default("daily-video").optional(),
  appLink: z.string().optional(),
});

export const userMetadata = z
  .object({
    proPaidForByTeamId: z.number().optional(),
    stripeCustomerId: z.string().optional(),
    vitalSettings: vitalSettingsUpdateSchema.optional(),
    isPremium: z.boolean().optional(),
    sessionTimeout: z.number().optional(), // Minutes
    defaultConferencingApp: schemaDefaultConferencingApp.optional(),
    defaultBookerLayouts: bookerLayouts.optional(),
    defaultHomeView: z.enum(["event-types", "bookings"]).optional(),
    emailChangeWaitingForVerification: z
      .string()
      .transform((data) => data.toLowerCase())
      .optional(),
    migratedToOrgFrom: z
      .object({
        username: z.string().or(z.null()).optional(),
        lastMigrationTime: z.string().optional(),
        reverted: z.boolean().optional(),
        revertTime: z.string().optional(),
      })
      .optional(),
  })
  .nullable();

export type DefaultConferencingApp = z.infer<typeof schemaDefaultConferencingApp>;

export const orgSettingsSchema = z
  .object({
    isOrganizationVerified: z.boolean().optional(),
    isOrganizationConfigured: z.boolean().optional(),
    isAdminReviewed: z.boolean().optional(),
    orgAutoAcceptEmail: z.string().optional(),
    isAdminAPIEnabled: z.boolean().optional(),
  })
  .nullable();
export type userMetadataType = z.infer<typeof userMetadata>;

export enum BillingPeriod {
  MONTHLY = "MONTHLY",
  ANNUALLY = "ANNUALLY",
}

const baseTeamMetadataSchema = z.object({
  defaultConferencingApp: schemaDefaultConferencingApp.optional(),
  requestedSlug: z.string().or(z.null()),
  paymentId: z.string(),
  subscriptionId: z.string().nullable(),
  subscriptionItemId: z.string().nullable(),
  orgSeats: z.number().nullable(),
  orgPricePerSeat: z.number().nullable(),
  migratedToOrgFrom: z
    .object({
      teamSlug: z.string().or(z.null()).optional(),
      lastMigrationTime: z.string().optional(),
      reverted: z.boolean().optional(),
      lastRevertTime: z.string().optional(),
    })
    .optional(),
  billingPeriod: z.nativeEnum(BillingPeriod).optional(),
});

export const teamMetadataSchema = baseTeamMetadataSchema.partial().nullable();

export const teamMetadataStrictSchema = baseTeamMetadataSchema
  .extend({
    subscriptionId: z
      .string()
      .refine((val) => val.startsWith("sub_"), {
        message: "subscriptionId must start with 'sub_'",
      })
      .nullable(),
    subscriptionItemId: z
      .string()
      .refine((val) => val.startsWith("si_"), {
        message: "subscriptionItemId must start with 'si_'",
      })
      .nullable(),
  })
  .partial()
  .nullable();

export const bookingMetadataSchema = z
  .object({
    videoCallUrl: z.string().optional(),
    platformClientId: z.string().optional(),
  })
  .and(z.record(z.string()))
  .nullable()
  .describe("BookingMetadata");

export const customInputOptionSchema = z.array(
  z.object({
    label: z.string(),
    type: z.string(),
  })
);

export const customInputSchema = z.object({
  id: z.number(),
  eventTypeId: z.number(),
  label: z.string(),
  type: z.nativeEnum(EventTypeCustomInputType),
  options: customInputOptionSchema.optional().nullable(),
  required: z.boolean(),
  placeholder: z.string(),
  hasToBeCreated: z.boolean().optional(),
});

export type CustomInputSchema = z.infer<typeof customInputSchema>;

export const recordingItemSchema = z
  .object({
    id: z.string(),
    room_name: z.string(),
    start_ts: z.number(),
    status: z.string(),
    max_participants: z.number().optional(),
    duration: z.number(),
    share_token: z.string(),
  })
  .passthrough();

export const recordingItemsSchema = z.array(recordingItemSchema);

export type RecordingItemSchema = z.infer<typeof recordingItemSchema>;

export const getRecordingsResponseSchema = z.union([
  z.object({
    total_count: z.number(),
    data: recordingItemsSchema,
  }),
  z.object({}),
]);

export type GetRecordingsResponseSchema = z.infer<typeof getRecordingsResponseSchema>;

/**
 * Ensures that it is a valid HTTP URL
 * It automatically avoids
 * -  XSS attempts through javascript:alert('hi')
 * - mailto: links
 */
export const successRedirectUrl = z
  .union([
    z.literal(""),
    z
      .string()
      .url()
      .regex(/^http(s)?:\/\/.*/),
  ])
  .optional();

export const DeploymentTheme = z
  .object({
    brand: z.string().default("#292929"),
    textBrand: z.string().default("#ffffff"),
    darkBrand: z.string().default("#fafafa"),
    textDarkBrand: z.string().default("#292929"),
    bookingHighlight: z.string().default("#10B981"),
    bookingLightest: z.string().default("#E1E1E1"),
    bookingLighter: z.string().default("#ACACAC"),
    bookingLight: z.string().default("#888888"),
    bookingMedian: z.string().default("#494949"),
    bookingDark: z.string().default("#313131"),
    bookingDarker: z.string().default("#292929"),
    fontName: z.string().default("Cal Sans"),
    fontSrc: z.string().default("https://cal.com/cal.ttf"),
  })
  .optional();

export type ZodDenullish<T extends ZodTypeAny> = T extends ZodNullable<infer U> | ZodOptional<infer U>
  ? ZodDenullish<U>
  : T;

export type ZodDenullishShape<T extends ZodRawShape> = {
  [k in keyof T]: ZodDenullish<T[k]>;
};

export const denullish = <T extends ZodTypeAny>(schema: T): ZodDenullish<T> =>
  (schema instanceof ZodNullable || schema instanceof ZodOptional
    ? denullish((schema._def as ZodNullableDef | ZodOptionalDef).innerType)
    : schema) as ZodDenullish<T>;

type UnknownKeysParam = "passthrough" | "strict" | "strip";

/**
 * @see https://github.com/3x071c/lsg-remix/blob/e2a9592ba3ec5103556f2cf307c32f08aeaee32d/app/lib/util/zod.ts
 */
export function denullishShape<
  T extends ZodRawShape,
  UnknownKeys extends UnknownKeysParam = "strip",
  Catchall extends ZodTypeAny = ZodTypeAny,
  Output = objectOutputType<T, Catchall>,
  Input = objectInputType<T, Catchall>,
>(
  obj: ZodObject<T, UnknownKeys, Catchall, Output, Input>
): ZodObject<ZodDenullishShape<T>, UnknownKeys, Catchall> {
  const a = entries(obj.shape).map(([field, schema]) => [field, denullish(schema)] as const) as {
    [K in keyof T]: [K, ZodDenullish<T[K]>];
  }[keyof T][];
  return new ZodObject({
    ...obj._def,
    shape: () => fromEntries(a) as unknown as ZodDenullishShape<T>, // TODO: Safely assert type
  });
}

/**
 * Like Object.entries, but with actually useful typings
 * @param obj The object to turn into a tuple array (`[key, value][]`)
 * @returns The constructed tuple array from the given object
 * @see https://github.com/3x071c/lsg-remix/blob/e2a9592ba3ec5103556f2cf307c32f08aeaee32d/app/lib/util/entries.ts
 */
export const entries = <O extends Record<string, unknown>>(
  obj: O
): {
  readonly [K in keyof O]: [K, O[K]];
}[keyof O][] => {
  return Object.entries(obj) as {
    [K in keyof O]: [K, O[K]];
  }[keyof O][];
};

/**
 * Returns a type with all readonly notations removed (traverses recursively on an object)
 */
type DeepWriteable<T> =
  T extends Readonly<{
    -readonly [K in keyof T]: T[K];
  }>
    ? {
        -readonly [K in keyof T]: DeepWriteable<T[K]>;
      }
    : T; /* Make it work with readonly types (this is not strictly necessary) */

type FromEntries<T> = T extends [infer Keys, unknown][]
  ? { [K in Keys & PropertyKey]: Extract<T[number], [K, unknown]>[1] }
  : never;

/**
 * Like Object.fromEntries, but with actually useful typings
 * @param arr The tuple array (`[key, value][]`) to turn into an object
 * @returns Object constructed from the given entries
 * @see https://github.com/3x071c/lsg-remix/blob/e2a9592ba3ec5103556f2cf307c32f08aeaee32d/app/lib/util/fromEntries.ts
 */
export const fromEntries = <
  E extends [PropertyKey, unknown][] | ReadonlyArray<readonly [PropertyKey, unknown]>,
>(
  entries: E
): FromEntries<DeepWriteable<E>> => {
  return Object.fromEntries(entries) as FromEntries<DeepWriteable<E>>;
};

export const getAccessLinkResponseSchema = z.object({
  download_link: z.string().url(),
});

export type GetAccessLinkResponseSchema = z.infer<typeof getAccessLinkResponseSchema>;

/** Facilitates converting values from Select inputs to plain ones before submitting */
export const optionToValueSchema = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z
    .object({
      label: z.string(),
      value: valueSchema,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .transform((foo) => (foo as any).value as z.infer<T>);

/**
 * Allows parsing without losing original data inference.
 * @url https://github.com/colinhacks/zod/discussions/1655#discussioncomment-4367368
 */
export const getParserWithGeneric =
  <T extends AnyZodObject>(valueSchema: T) =>
  <Data>(data: Data) => {
    type Output = z.infer<T>;
    type SimpleFormValues = string | number | null | undefined;
    return valueSchema.parse(data) as {
      // TODO: Invesitage why this broke on zod 3.22.2 upgrade
      [key in keyof Data]: Data[key] extends SimpleFormValues ? Data[key] : Output[key];
    };
  };
export const sendDailyVideoRecordingEmailsSchema = z.object({
  recordingId: z.string(),
  bookingUID: z.string(),
});

export const downloadLinkSchema = z.object({
  download_link: z.string(),
});

// All properties within event type that can and will be updated if needed
export const allManagedEventTypeProps: { [k in keyof Omit<Prisma.EventTypeSelect, "id">]: true } = {
  title: true,
  description: true,
  interfaceLanguage: true,
  isInstantEvent: true,
  instantMeetingParameters: true,
  instantMeetingExpiryTimeOffsetInSeconds: true,
  currency: true,
  periodDays: true,
  position: true,
  price: true,
  slug: true,
  length: true,
  offsetStart: true,
  locations: true,
  hidden: true,
  availability: true,
  recurringEvent: true,
  customInputs: true,
  minimumRescheduleNotice: true,
  disableGuests: true,
  disableCancelling: true,
  disableRescheduling: true,
  requiresCancellationReason: true,
  allowReschedulingCancelledBookings: true,
  requiresConfirmation: true,
  canSendCalVideoTranscriptionEmails: true,
  requiresConfirmationForFreeEmail: true,
  requiresConfirmationWillBlockSlot: true,
  eventName: true,
  metadata: true,
  children: true,
  hideCalendarNotes: true,
  hideCalendarEventDetails: true,
  minimumBookingNotice: true,
  beforeEventBuffer: true,
  afterEventBuffer: true,
  successRedirectUrl: true,
  seatsPerTimeSlot: true,
  seatsShowAttendees: true,
  seatsShowAvailabilityCount: true,
  forwardParamsSuccessRedirect: true,
  periodType: true,
  hashedLink: true,
  webhooks: true,
  periodStartDate: true,
  periodEndDate: true,
  destinationCalendar: true,
  periodCountCalendarDays: true,
  bookingLimits: true,
  onlyShowFirstAvailableSlot: true,
  showOptimizedSlots: true,
  slotInterval: true,
  scheduleId: true,
  bookingFields: true,
  durationLimits: true,
  maxActiveBookingsPerBooker: true,
  maxActiveBookingPerBookerOfferReschedule: true,
  lockTimeZoneToggleOnBookingPage: true,
  lockedTimeZone: true,
  requiresBookerEmailVerification: true,
  assignAllTeamMembers: true,
  isRRWeightsEnabled: true,
  eventTypeColor: true,
  allowReschedulingPastBookings: true,
  hideOrganizerEmail: true,
  rescheduleWithSameRoundRobinHost: true,
  maxLeadThreshold: true,
  customReplyToEmail: true,
  bookingRequiresAuthentication: true,
};

// All properties that are defined as unlocked based on all managed props
// Eventually this is going to be just a default and the user can change the config through the UI
export const unlockedManagedEventTypeProps = {
  locations: allManagedEventTypeProps.locations,
  scheduleId: allManagedEventTypeProps.scheduleId,
  destinationCalendar: allManagedEventTypeProps.destinationCalendar,
};

// Zod-compatible version of allManagedEventTypeProps that only includes scalar fields
// (excludes Prisma relation fields like children, users, webhooks, availability, etc.)
// This is used with EventTypeSchema.pick() which requires exact key matching
// IMPORTANT: This must match the scalar fields in allManagedEventTypeProps exactly
export const allManagedEventTypePropsForZod = {
  title: true,
  description: true,
  interfaceLanguage: true,
  isInstantEvent: true,
  instantMeetingParameters: true,
  instantMeetingExpiryTimeOffsetInSeconds: true,
  currency: true,
  periodDays: true,
  position: true,
  price: true,
  slug: true,
  length: true,
  offsetStart: true,
  locations: true,
  hidden: true,
  recurringEvent: true,
  minimumRescheduleNotice: true,
  disableGuests: true,
  disableCancelling: true,
  disableRescheduling: true,
  requiresCancellationReason: true,
  allowReschedulingCancelledBookings: true,
  requiresConfirmation: true,
  canSendCalVideoTranscriptionEmails: true,
  requiresConfirmationForFreeEmail: true,
  requiresConfirmationWillBlockSlot: true,
  eventName: true,
  metadata: true,
  hideCalendarNotes: true,
  hideCalendarEventDetails: true,
  minimumBookingNotice: true,
  beforeEventBuffer: true,
  afterEventBuffer: true,
  successRedirectUrl: true,
  seatsPerTimeSlot: true,
  seatsShowAttendees: true,
  seatsShowAvailabilityCount: true,
  forwardParamsSuccessRedirect: true,
  periodType: true,
  periodStartDate: true,
  periodEndDate: true,
  periodCountCalendarDays: true,
  bookingLimits: true,
  onlyShowFirstAvailableSlot: true,
  showOptimizedSlots: true,
  slotInterval: true,
  scheduleId: true,
  bookingFields: true,
  durationLimits: true,
  maxActiveBookingsPerBooker: true,
  maxActiveBookingPerBookerOfferReschedule: true,
  lockTimeZoneToggleOnBookingPage: true,
  lockedTimeZone: true,
  requiresBookerEmailVerification: true,
  assignAllTeamMembers: true,
  isRRWeightsEnabled: true,
  eventTypeColor: true,
  allowReschedulingPastBookings: true,
  hideOrganizerEmail: true,
  rescheduleWithSameRoundRobinHost: true,
  maxLeadThreshold: true,
  customReplyToEmail: true,
  bookingRequiresAuthentication: true,
} as const;

// Zod-compatible version of unlockedManagedEventTypeProps
export const unlockedManagedEventTypePropsForZod = {
  locations: true,
  scheduleId: true,
} as const;

export const emailSchema = emailRegexSchema;

// The PR at https://github.com/colinhacks/zod/pull/2157 addresses this issue and improves email validation
// I introduced this refinement(to be used with z.email()) as a short term solution until we upgrade to a zod
// version that will include updates in the above PR.
export const emailSchemaRefinement = (value: string | null | undefined) => {
  // If there's no value, it's NOT a valid email format, so return false.
  if (!value) return false;
  return emailSchema.safeParse(value).success;
};

export const signupSchema = z.object({
  // Username is marked optional here because it's requirement depends on if it's the Organization invite or a team invite which isn't easily done in zod
  // It's better handled beyond zod in `validateAndGetCorrectedUsernameAndEmail`
  username: z.string().optional(),
  email: z.string().regex(emailRegex, { message: "Invalid email" }),
  password: z.string().superRefine((data, ctx) => {
    const isStrict = false;
    const result = isPasswordValid(data, true, isStrict);
    Object.keys(result).map((key: string) => {
      if (!result[key as keyof typeof result]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: key,
        });
      }
    });
  }),
  language: z.string().optional(),
  token: z.string().optional(),
});

export const ZVerifyCodeInputSchema = z.object({
  email: emailSchema,
  code: z.string(),
});

export type ZVerifyCodeInputSchema = z.infer<typeof ZVerifyCodeInputSchema>;

export const coerceToDate = z.coerce.date();
export const getStringAsNumberRequiredSchema = (t: TFunction) =>
  z.string().min(1, t("error_required_field")).pipe(z.coerce.number());

export const bookingSeatDataSchema = z.object({
  description: z.string().optional(),
  responses: bookingResponses,
});

// Schema for decrypted service account key
export const serviceAccountKeySchema = z
  .object({
    private_key: z.string(),
    client_email: z.string().optional(),
    client_id: z.string(),
    tenant_id: z.string().optional(),
  })
  .passthrough();

export type TServiceAccountKeySchema = z.infer<typeof serviceAccountKeySchema>;

// rrSegmentQueryValue is stored as JSON in EventType - just parse as nullable JSON object
export const rrSegmentQueryValueSchema = z.record(z.string(), z.unknown()).nullish();

// Routing Form Fields
export const fieldTypeEnum = z.enum([
  "name",
  "text",
  "textarea",
  "number",
  "email",
  "phone",
  "address",
  "multiemail",
  "select",
  "multiselect",
  "checkbox",
  "radio",
  "radioInput",
  "boolean",
  "url",
]);

export type FieldType = z.infer<typeof fieldTypeEnum>;

export const excludeOrRequireEmailSchema = z.string().superRefine((val, ctx) => {
  // Allow empty input: field is optional at the form level but may come through as empty string
  if (val.trim() === "") return;

  const allDomains = val
    .split(",")
    .map((dom) => dom.trim())
    .filter(Boolean);

  // If user entered only separators/commas, treat as invalid input
  if (allDomains.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter valid domain or email",
    });
    return;
  }

  // Accept forms: domain-only, `@domain`, or `local@domain`
  // - Domain labels: alnum, hyphens allowed internally, no leading/trailing hyphen
  // - Require at least one dot and end with an alpha TLD of length ≥2
  const EMAIL_OR_DOMAIN_PATTERN =
    /^(?:[a-z0-9._+'-]+@|@)?(?:[a-z]{2,}|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})$/i;

  const isValid = allDomains.every((entry) => EMAIL_OR_DOMAIN_PATTERN.test(entry));

  if (!isValid) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter valid domain or email",
    });
  }
});

export const EditableSchema = z.enum([
  "system", // Can't be deleted, can't be hidden, name can't be edited, can't be marked optional
  "system-but-optional", // Can't be deleted. Name can't be edited. But can be hidden or be marked optional
  "system-but-hidden", // Can't be deleted, name can't be edited, will be shown
  "user", // Fully editable
  "user-readonly", // All fields are readOnly.
]);

export const baseFieldSchema = z.object({
  name: z.string().transform(getValidRhfFieldName),
  type: fieldTypeEnum,
  // TODO: We should make at least one of `defaultPlaceholder` and `placeholder` required. Do the same for label.
  label: z.string().optional(),
  labelAsSafeHtml: z.string().optional(),

  /**
   * It is the default label that will be used when a new field is created.
   * Note: It belongs in FieldsTypeConfig, so that changing defaultLabel in code can work for existing fields as well(for fields that are using the default label).
   * Supports translation
   */
  defaultLabel: z.string().optional(),

  placeholder: z.string().optional(),
  /**
   * It is the default placeholder that will be used when a new field is created.
   * Note: Same as defaultLabel, it belongs in FieldsTypeConfig
   * Supports translation
   */
  defaultPlaceholder: z.string().optional(),
  required: z.boolean().default(false).optional(),
  /**
   * It is the list of options that is valid for a certain type of fields.
   *
   */
  options: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        price: z.coerce.number().min(0).optional(),
      })
    )
    .optional(),
  /**
   * This is an alternate way to specify options when the options are stored elsewhere. Form Builder expects options to be present at `dataStore[getOptionsAt]`
   * This allows keeping a single source of truth in DB.
   */
  getOptionsAt: z.string().optional(),

  /**
   * For `radioInput` type of questions, it stores the input that is shown based on the user option selected.
   * e.g. If user is given a list of locations and he selects "Phone", then he will be shown a phone input
   */
  optionsInputs: z
    .record(
      z.object({
        // Support all types as needed
        // Must be a subset of `fieldTypeEnum`.TODO: Enforce it in TypeScript
        type: z.enum(["address", "phone", "text"]),
        required: z.boolean().optional(),
        placeholder: z.string().optional(),
      })
    )
    .optional(),

  /**
   * It is the minimum number of characters that can be entered in the field.
   * It is used for types with `supportsLengthCheck= true`.
   * @default 0
   * @requires supportsLengthCheck = true
   */
  minLength: z.number().optional(),

  /**
   * It is the maximum number of characters that can be entered in the field.
   * It is used for types with `supportsLengthCheck= true`.
   * @requires supportsLengthCheck = true
   */
  maxLength: z.number().optional(),

  // Emails that needs to be excluded
  excludeEmails: excludeOrRequireEmailSchema.optional(),
  // Emails that need to be required
  requireEmails: excludeOrRequireEmailSchema.optional(),
  // Price associated with the field which works like addons which users can add to the booking
  price: z.coerce.number().min(0).optional(),
});

export const variantsConfigSchema = z.object({
  variants: z.record(
    z.object({
      /**
       * Variant Fields schema for a variant of the main field.
       * It doesn't support non text fields as of now
       **/
      fields: baseFieldSchema
        .omit({
          defaultLabel: true,
          defaultPlaceholder: true,
          options: true,
          getOptionsAt: true,
          optionsInputs: true,
        })
        .array(),
    })
  ),
});

export const fieldSchema = baseFieldSchema.merge(
  z.object({
    variant: z.string().optional(),
    variantsConfig: variantsConfigSchema.optional(),

    views: z
      .object({
        label: z.string(),
        id: z.string(),
        description: z.string().optional(),
      })
      .array()
      .optional(),

    /**
     * It is used to hide fields such as location when there are less than two options
     */
    hideWhenJustOneOption: z.boolean().default(false).optional(),

    hidden: z.boolean().optional(),
    editable: EditableSchema.default("user").optional(),
    sources: z
      .array(
        z.object({
          // Unique ID for the `type`. If type is workflow, it's the workflow ID
          id: z.string(),
          type: z.union([z.literal("user"), z.literal("system"), z.string()]),
          label: z.string(),
          editUrl: z.string().optional(),
          // Mark if a field is required by this source or not. This allows us to set `field.required` based on all the sources' fieldRequired value
          fieldRequired: z.boolean().optional(),
        })
      )
      .optional(),
    disableOnPrefill: z.boolean().default(false).optional(),
  })
);

export const eventTypeBookingFields = z.array(fieldSchema);
export const BookingFieldTypeEnum = eventTypeBookingFields.element.shape.type.Enum;
