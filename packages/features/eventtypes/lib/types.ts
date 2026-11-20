import type { ConnectedApps } from "@calcom/app-store/_utils/getConnectedApps";
import type { EventLocationType } from "@calcom/app-store/locations";
import type { eventTypeMetaDataSchemaWithTypedApps } from "@calcom/app-store/zod-utils";
import type { ChildrenEventType } from "@calcom/features/eventtypes/lib/childrenEventType";
import type { IntervalLimit } from "@calcom/lib/intervalLimits/intervalLimitSchema";
import type { EventTypeTranslation } from "@calcom/prisma/client";
import type {
  CancellationReasonRequirement,
  MembershipRole,
  PeriodType,
  SchedulingType,
} from "@calcom/prisma/enums";
import type {
  BookerLayoutSettings,
  CustomInputSchema,
  customInputSchema,
  EventTypeLocation,
  EventTypeMetadata,
  eventTypeBookingFields,
  eventTypeColor,
} from "@calcom/prisma/zod-utils";
import type { RecurringEvent } from "@calcom/types/Calendar";
import type { UserProfile } from "@calcom/types/UserProfile";
import type { z } from "zod";
import type { EventType } from "./getEventTypeById";
import {DisableCancelling} from "@calcom/prisma/enums";

export type CustomInputParsed = typeof customInputSchema._output;

export type AvailabilityOption = {
  label: string;
  value: number;
  isDefault: boolean;
  isManaged?: boolean;
};
export type EventTypeSetupProps = EventType;
export type EventTypeSetup = EventType["eventType"];
export type EventTypeApps = ConnectedApps;
export type HostLocation = {
  id?: string;
  userId: number;
  eventTypeId: number;
  type: EventLocationType["type"];
  credentialId?: number | null;
  link?: string | null;
  address?: string | null;
  phoneNumber?: string | null;
};

export type Host = {
  isFixed: boolean;
  userId: number;
  priority: number;
  weight: number;
  scheduleId?: number | null;
  groupId: string | null;
  location?: HostLocation | null;
};

export type TeamMember = {
  value: string;
  label: string;
  avatar: string;
  email: string;
  defaultScheduleId: number | null;
};

type EventLocation = {
  type: EventLocationType["type"];
  address?: string;
  attendeeAddress?: string;
  somewhereElse?: string;
  link?: string;
  hostPhoneNumber?: string;
  displayLocationPublicly?: boolean;
  phone?: string;
  hostDefault?: string;
  credentialId?: number;
  teamName?: string;
  customLabel?: string;
};

export type PrivateLinkWithOptions = {
  link: string;
  expiresAt?: Date | null;
  maxUsageCount?: number | null;
  usageCount?: number;
};

export type FormValues = {
  id: number;
  title: string;
  eventTitle: string;
  eventName: string;
  slug: string;
  interfaceLanguage: string | null;
  isInstantEvent: boolean;
  instantMeetingParameters: string[];
  instantMeetingExpiryTimeOffsetInSeconds: number;
  length: number;
  offsetStart: number;
  description: string;
  disableGuests: boolean;
  lockTimeZoneToggleOnBookingPage: boolean;
  lockedTimeZone: string | null;
  requiresConfirmation: boolean;
  requiresConfirmationWillBlockSlot: boolean;
  requiresConfirmationForFreeEmail: boolean;
  requiresBookerEmailVerification: boolean;
  recurringEvent: RecurringEvent | null;
  schedulingType: SchedulingType | null;
  hidden: boolean;
  hideCalendarNotes: boolean;
  multiplePrivateLinks: (string | PrivateLinkWithOptions)[] | undefined;
  eventTypeColor: z.infer<typeof eventTypeColor>;
  customReplyToEmail: string | null;
  locations: EventLocation[];
  customInputs: CustomInputParsed[];
  schedule: number | null;
  useEventLevelSelectedCalendars: boolean;
  disabledCancelling: DisableCancelling;
  disabledRescheduling: boolean;
  minimumRescheduleNotice: number | null;
  periodType: PeriodType;
  /**
   * Number of days(Applicable only for ROLLING period type)
   */
  periodDays: number;
  /**
   * Should consider Calendar Days(and not Business Days)(Applicable only for ROLLING period type)
   */
  periodCountCalendarDays: boolean;
  /**
   * Date Range(Applicable only for RANGE period type)
   */
  periodDates: { startDate: Date; endDate: Date };
  rollingExcludeUnavailableDays: boolean;

  seatsPerTimeSlot: number | null;
  seatsShowAttendees: boolean | null;
  seatsShowAvailabilityCount: boolean | null;
  seatsPerTimeSlotEnabled: boolean;
  autoTranslateDescriptionEnabled: boolean;
  autoTranslateInstantMeetingTitleEnabled: boolean;
  fieldTranslations: EventTypeTranslation[];
  scheduleName: string;
  minimumBookingNotice: number;
  minimumBookingNoticeInDurationType: number;
  maxActiveBookingsPerBooker: number | null;
  beforeEventBuffer: number;
  afterEventBuffer: number;
  slotInterval: number | null;
  metadata: z.infer<typeof eventTypeMetaDataSchemaWithTypedApps>;
  destinationCalendar: {
    integration: string;
    externalId: string;
  };
  successRedirectUrl: string;
  durationLimits?: IntervalLimit;
  bookingLimits?: IntervalLimit;
  onlyShowFirstAvailableSlot: boolean;
  showOptimizedSlots: boolean;
  children: ChildrenEventType[];
  hosts: Host[];
  hostGroups: {
    id: string;
    name: string;
  }[];
  bookingFields: z.infer<typeof eventTypeBookingFields>;
  availability?: AvailabilityOption;
  bookerLayouts: BookerLayoutSettings;
  multipleDurationEnabled: boolean;
  users: EventTypeSetup["users"];
  assignAllTeamMembers: boolean;
  assignRRMembersUsingSegment: boolean;
  rrSegmentQueryValue: Record<string, unknown> | null;
  rescheduleWithSameRoundRobinHost: boolean;
  useEventTypeDestinationCalendarEmail: boolean;
  forwardParamsSuccessRedirect: boolean | null;
  secondaryEmailId?: number;
  isRRWeightsEnabled: boolean;
  maxLeadThreshold?: number;
  restrictionScheduleId: number | null;
  useBookerTimezone: boolean;
  restrictionScheduleName: string | null;
  calVideoSettings?: CalVideoSettings;
  maxActiveBookingPerBookerOfferReschedule: boolean;
  enablePerHostLocations: boolean;
  requiresCancellationReason?: CancellationReasonRequirement | null;
};

export type LocationFormValues = Pick<FormValues, "id" | "locations" | "bookingFields" | "seatsPerTimeSlot">;

export type EventTypeAssignedUsers = {
  owner: {
    avatar: string;
    email: string;
    name: string;
    username: string;
    membership: MembershipRole;
    id: number;
    avatarUrl: string | null;
    nonProfileUsername: string | null;
    profile: UserProfile;
  };
  created: boolean;
  hidden: boolean;
  slug: string;
}[];

export type EventTypeHosts = {
  user: {
    timeZone: string;
  };
  userId: number;
  scheduleId: number | null;
  isFixed: boolean;
  priority: number | null;
  weight: number | null;
  groupId: string | null;
}[];

// ============================================================================
// EVENT TYPE UPDATE INPUT TYPES
// ============================================================================
// These types define the shape of event type update operations and should be
// consumed by both the features package and tRPC routers.
// ============================================================================

export type HashedLinkInput = {
  link: string;
  expiresAt?: Date | null;
  maxUsageCount?: number | null;
  usageCount?: number | null;
};

export type HostLocationInput = {
  id?: string;
  userId: number;
  eventTypeId: number;
  type: string;
  credentialId?: number | null;
  link?: string | null;
  address?: string | null;
  phoneNumber?: string | null;
};

export type HostInput = {
  userId: number;
  profileId?: number | null;
  isFixed?: boolean;
  priority?: number | null;
  weight?: number | null;
  scheduleId?: number | null;
  groupId?: string | null;
  location?: HostLocationInput | null;
};

export type HostGroupInput = {
  id: string;
  name: string;
};

export type ChildInput = {
  owner: {
    id: number;
    name: string;
    email: string;
    eventTypeSlugs: string[];
  };
  hidden: boolean;
};

export type DestinationCalendarInput = {
  integration: string;
  externalId: string;
} | null;

export type RecurringEventInput = {
  dtstart?: Date;
  interval: number;
  count: number;
  freq: number;
  until?: Date;
  tzid?: string;
} | null;

export type EventTypeColorInput = {
  lightEventTypeColor: string;
  darkEventTypeColor: string;
} | null;

/**
 * Booking field type - minimal type definition for fields that need to be accessed.
 * Only includes properties that are actually read in server code.
 * Does NOT use an index signature to maintain compatibility with API v2 DTO classes.
 */
export type BookingFieldInput = {
  name: string;
  hidden?: boolean;
  required?: boolean;
  type?: string;
};

/**
 * RR Segment query value - using index signature for complex RAQB structure.
 * The values need to be indexable (string keys) for downstream usage.
 */
export type RRSegmentQueryValueInput = {
  [key: string]: unknown;
} | null;

/**
 * Explicit type definition for event type update input.
 *
 * This type is defined explicitly rather than using z.infer<> on a complex
 * schema chain to significantly reduce TypeScript type-checking time.
 * The schema still validates all fields at runtime.
 *
 * All fields are optional (from .partial()) except `id` which is required.
 */
export type EventTypeUpdateInput = {
  // Required field
  id: number;

  // Fields from EventTypeSchema (all optional due to .partial())
  periodType?: PeriodType;
  schedulingType?: SchedulingType | null;
  title?: string;
  slug?: string;
  description?: string | null;
  interfaceLanguage?: string | null;
  position?: number;
  locations?: EventTypeLocation[] | null;
  length?: number;
  offsetStart?: number;
  hidden?: boolean;
  userId?: number | null;
  profileId?: number | null;
  teamId?: number | null;
  useEventLevelSelectedCalendars?: boolean;
  eventName?: string | null;
  parentId?: number | null;
  bookingFields?: BookingFieldInput[] | null;
  timeZone?: string | null;
  periodStartDate?: Date | null;
  periodEndDate?: Date | null;
  periodDays?: number | null;
  periodCountCalendarDays?: boolean | null;
  lockTimeZoneToggleOnBookingPage?: boolean;
  lockedTimeZone?: string | null;
  requiresConfirmation?: boolean;
  requiresConfirmationWillBlockSlot?: boolean;
  requiresConfirmationForFreeEmail?: boolean;
  requiresBookerEmailVerification?: boolean;
  canSendCalVideoTranscriptionEmails?: boolean;
  autoTranslateDescriptionEnabled?: boolean;
  autoTranslateInstantMeetingTitleEnabled?: boolean;
  recurringEvent?: RecurringEventInput;
  disableGuests?: boolean;
  hideCalendarNotes?: boolean;
  hideCalendarEventDetails?: boolean;
  minimumBookingNotice?: number;
  beforeEventBuffer?: number;
  afterEventBuffer?: number;
  seatsPerTimeSlot?: number | null;
  onlyShowFirstAvailableSlot?: boolean;
  showOptimizedSlots?: boolean | null;
  disableCancelling?: DisableCancelling | null;
  disableRescheduling?: boolean | null;
  requiresCancellationReason?: CancellationReasonRequirement | null;
  minimumRescheduleNotice?: number | null;
  seatsShowAttendees?: boolean | null;
  seatsShowAvailabilityCount?: boolean | null;
  scheduleId?: number | null;
  allowReschedulingCancelledBookings?: boolean | null;
  price?: number;
  currency?: string;
  slotInterval?: number | null;
  metadata?: EventTypeMetadata;
  successRedirectUrl?: string | null;
  forwardParamsSuccessRedirect?: boolean | null;
  bookingLimits?: IntervalLimit | null;
  durationLimits?: IntervalLimit | null;
  isInstantEvent?: boolean;
  instantMeetingExpiryTimeOffsetInSeconds?: number;
  instantMeetingScheduleId?: number | null;
  instantMeetingParameters?: string[];
  assignAllTeamMembers?: boolean;
  assignRRMembersUsingSegment?: boolean;
  rrSegmentQueryValue?: RRSegmentQueryValueInput;
  useEventTypeDestinationCalendarEmail?: boolean;
  isRRWeightsEnabled?: boolean;
  maxLeadThreshold?: number | null;
  includeNoShowInRRCalculation?: boolean;
  allowReschedulingPastBookings?: boolean;
  hideOrganizerEmail?: boolean;
  maxActiveBookingsPerBooker?: number | null;
  maxActiveBookingPerBookerOfferReschedule?: boolean;
  customReplyToEmail?: string | null;
  eventTypeColor?: EventTypeColorInput;
  rescheduleWithSameRoundRobinHost?: boolean;
  secondaryEmailId?: number | null;
  useBookerTimezone?: boolean;
  restrictionScheduleId?: number | null;
  bookingRequiresAuthentication?: boolean;
  rrHostSubsetEnabled?: boolean;
  createdAt?: Date | null;
  updatedAt?: Date | null;

  // Extended fields (all optional due to .partial())
  calVideoSettings?: CalVideoSettings;
  customInputs?: CustomInputSchema[];
  destinationCalendar?: DestinationCalendarInput;
  users?: number[];
  children?: ChildInput[];
  hosts?: HostInput[];
  schedule?: number | null;
  instantMeetingSchedule?: number | null;
  multiplePrivateLinks?: (string | HashedLinkInput)[];
  hostGroups?: HostGroupInput[];
  enablePerHostLocations?: boolean;
};

export type TabMap = {
  advanced: React.ReactNode;
  ai?: React.ReactNode;
  apps?: React.ReactNode;
  availability: React.ReactNode;
  instant?: React.ReactNode;
  limits: React.ReactNode;
  recurring: React.ReactNode;
  setup: React.ReactNode;
  team?: React.ReactNode;
  webhooks?: React.ReactNode;
  payments?: React.ReactNode;
};

export type SettingsToggleClassNames = {
  container?: string;
  label?: string;
  description?: string;
  children?: string;
};

export type InputClassNames = {
  container?: string;
  label?: string;
  input?: string;
  addOn?: string;
};
export type CheckboxClassNames = {
  checkbox?: string;
  description?: string;
  container?: string;
};
export type SelectClassNames = {
  innerClassNames?: {
    input?: string;
    option?: string;
    control?: string;
    singleValue?: string;
    valueContainer?: string;
    multiValue?: string;
    menu?: string;
    menuList?: string;
  };
  select?: string;
  label?: string;
  container?: string;
};

// Re-export schemas from server-safe location
export { createEventTypeInput, EventTypeDuplicateInput } from "./schemas";

export type FormValidationResult = {
  isValid: boolean;
  errors: Record<string, unknown>;
};

export interface EventTypePlatformWrapperRef {
  validateForm: () => Promise<FormValidationResult>;
  handleFormSubmit: (callbacks?: { onSuccess?: () => void; onError?: (error: Error) => void }) => void;
}

export type CalVideoSettings = {
  disableRecordingForGuests?: boolean | null;
  disableRecordingForOrganizer?: boolean | null;
  enableAutomaticTranscription?: boolean | null;
  enableAutomaticRecordingForOrganizer?: boolean | null;
  disableTranscriptionForGuests?: boolean | null;
  disableTranscriptionForOrganizer?: boolean | null;
  redirectUrlOnExit?: string | null;
  requireEmailForGuests?: boolean | null;
} | null;
