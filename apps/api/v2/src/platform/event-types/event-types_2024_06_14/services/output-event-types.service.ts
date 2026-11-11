import {
  getBookingFieldsWithSystemFields,
  parseBookingLimit,
  parseRecurringEvent,
  userMetadata,
} from "@calcom/platform-libraries";
import { EventTypeMetaDataSchema, parseEventTypeColor } from "@calcom/platform-libraries/event-types";
import { getBookerBaseUrlSync } from "@calcom/platform-libraries/organizations";
import type {
  BookerLayoutsTransformedSchema,
  EventTypeOutput_2024_06_14,
  NoticeThresholdTransformedSchema,
  OutputBookingField_2024_06_14,
  OutputUnknownBookingField_2024_06_14,
  OutputUnknownLocation_2024_06_14,
  TransformFutureBookingsLimitSchema_2024_06_14,
} from "@calcom/platform-types";
import type {
  CalVideoSettings,
  DestinationCalendar,
  EventType,
  Prisma,
  Schedule,
  Team,
} from "@calcom/prisma/client";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  BookingFieldSchema,
  CustomField,
  InternalLocation,
  InternalLocationSchema,
  SystemField,
  transformBookerLayoutsInternalToApi,
  transformBookingFieldsInternalToApi,
  transformEventTypeColorsInternalToApi,
  transformFutureBookingLimitsInternalToApi,
  transformIntervalLimitsInternalToApi,
  transformLocationsInternalToApi,
  transformRecurrenceInternalToApi,
  transformRequiresConfirmationInternalToApi,
  transformSeatsInternalToApi,
} from "@/platform/event-types/event-types_2024_06_14/transformers";
import { ProfileMinimal, UsersService } from "@/modules/users/services/users.service";

type EventTypeUser = {
  id: number;
  name: string | null;
  username: string | null;
  isPlatformManaged?: boolean;
  avatarUrl: string | null;
  brandColor: string | null;
  darkBrandColor: string | null;
  weekStart: string;
  metadata: Prisma.JsonValue;
  organizationId: number | null;
  organization?: { slug: string | null; isPlatform?: boolean } | null;
  movedToProfile?: ProfileMinimal | null;
  profiles?: ProfileMinimal[];
};

type EventTypeRelations = {
  users: EventTypeUser[];
  schedule: Schedule | null;
  destinationCalendar?: DestinationCalendar | null;
  calVideoSettings?: CalVideoSettings | null;
};
export type DatabaseEventType = EventType & EventTypeRelations;

type Input = Pick<
  DatabaseEventType,
  | "id"
  | "length"
  | "title"
  | "description"
  | "disableGuests"
  | "slotInterval"
  | "minimumBookingNotice"
  | "beforeEventBuffer"
  | "afterEventBuffer"
  | "slug"
  | "schedulingType"
  | "requiresConfirmation"
  | "price"
  | "currency"
  | "lockTimeZoneToggleOnBookingPage"
  | "seatsPerTimeSlot"
  | "forwardParamsSuccessRedirect"
  | "successRedirectUrl"
  | "seatsShowAvailabilityCount"
  | "isInstantEvent"
  | "locations"
  | "bookingFields"
  | "recurringEvent"
  | "metadata"
  | "users"
  | "scheduleId"
  | "bookingLimits"
  | "durationLimits"
  | "onlyShowFirstAvailableSlot"
  | "offsetStart"
  | "periodType"
  | "periodDays"
  | "periodCountCalendarDays"
  | "periodStartDate"
  | "periodEndDate"
  | "requiresBookerEmailVerification"
  | "hideCalendarNotes"
  | "eventTypeColor"
  | "seatsShowAttendees"
  | "requiresConfirmationWillBlockSlot"
  | "eventName"
  | "destinationCalendar"
  | "useEventTypeDestinationCalendarEmail"
  | "hideCalendarEventDetails"
  | "hideOrganizerEmail"
  | "calVideoSettings"
  | "hidden"
  | "bookingRequiresAuthentication"
  | "maxActiveBookingsPerBooker"
  | "maxActiveBookingPerBookerOfferReschedule"
  | "disableCancelling"
  | "disableRescheduling"
  | "minimumRescheduleNotice"
  | "minimumCancellationNotice"
  | "canSendCalVideoTranscriptionEmails"
  | "interfaceLanguage"
  | "allowReschedulingPastBookings"
  | "allowReschedulingCancelledBookings"
  | "showOptimizedSlots"
>;

@Injectable()
export class OutputEventTypesService_2024_06_14 {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService
  ) {}

  getResponseEventType(
    ownerId: number,
    databaseEventType: Input,
    isOrgTeamEvent: boolean
  ): EventTypeOutput_2024_06_14 {
    const {
      id,
      length,
      title,
      description,
      disableGuests,
      slotInterval,
      minimumBookingNotice,
      beforeEventBuffer,
      afterEventBuffer,
      slug,
      price,
      currency,
      lockTimeZoneToggleOnBookingPage,
      seatsPerTimeSlot,
      forwardParamsSuccessRedirect,
      successRedirectUrl,
      seatsShowAvailabilityCount,
      isInstantEvent,
      scheduleId,
      onlyShowFirstAvailableSlot,
      offsetStart,
      requiresBookerEmailVerification,
      hideCalendarNotes,
      seatsShowAttendees,
      useEventTypeDestinationCalendarEmail,
      hideCalendarEventDetails,
      hideOrganizerEmail,
      calVideoSettings,
      hidden,
      bookingRequiresAuthentication,
      disableCancelling,
      disableRescheduling,
      minimumRescheduleNotice,
      minimumCancellationNotice,
      canSendCalVideoTranscriptionEmails,
      interfaceLanguage,
      allowReschedulingPastBookings,
      allowReschedulingCancelledBookings,
      showOptimizedSlots,
    } = databaseEventType;

    const locations = this.transformLocations(databaseEventType.locations);
    const customName = databaseEventType?.eventName ?? undefined;
    const bookingFields = databaseEventType.bookingFields
      ? this.transformBookingFields(databaseEventType.bookingFields)
      : this.getDefaultBookingFields(isOrgTeamEvent);

    const recurrence = this.transformRecurringEvent(databaseEventType.recurringEvent);
    const metadata = this.transformMetadata(databaseEventType.metadata) || {};
    const users = this.transformUsers(databaseEventType.users || []);
    const bookingLimitsCount = this.transformIntervalLimits(databaseEventType.bookingLimits);
    const bookingLimitsDuration = this.transformIntervalLimits(databaseEventType.durationLimits);
    const color = this.transformEventTypeColor(databaseEventType.eventTypeColor);
    const bookerLayouts = this.transformBookerLayouts(
      metadata.bookerLayouts as unknown as BookerLayoutsTransformedSchema
    );
    const confirmationPolicy = this.transformRequiresConfirmation(
      !!databaseEventType.requiresConfirmation,
      !!databaseEventType.requiresConfirmationWillBlockSlot,
      metadata.requiresConfirmationThreshold as NoticeThresholdTransformedSchema
    );
    delete metadata["bookerLayouts"];
    delete metadata["requiresConfirmationThreshold"];
    const seats = this.transformSeats(seatsPerTimeSlot, seatsShowAttendees, seatsShowAvailabilityCount);
    const bookingWindow = this.transformBookingWindow({
      periodType: databaseEventType.periodType,
      periodDays: databaseEventType.periodDays,
      periodCountCalendarDays: databaseEventType.periodCountCalendarDays,
      periodStartDate: databaseEventType.periodStartDate,
      periodEndDate: databaseEventType.periodEndDate,
    } as TransformFutureBookingsLimitSchema_2024_06_14);
    const destinationCalendar = this.transformDestinationCalendar(databaseEventType.destinationCalendar);
    const bookerActiveBookingsLimit = this.transformBookerActiveBookingsLimit(databaseEventType);
    const bookingUrl = this.buildBookingUrl(databaseEventType.users[0], slug);
    const disableReschedulingOutput = this.transformDisableRescheduling(
      disableRescheduling,
      minimumRescheduleNotice
    );
    const disableCancellingOutput = this.transformDisableCancelling(
      disableCancelling,
      minimumCancellationNotice
    );
    const calVideoSettingsOutput = this.transformCalVideoSettings(
      calVideoSettings,
      canSendCalVideoTranscriptionEmails
    );

    return {
      id,
      ownerId,
      lengthInMinutes: length,
      lengthInMinutesOptions: metadata.multipleDuration,
      title,
      slug,
      description: description || "",
      locations,
      bookingFields,
      recurrence,
      disableGuests,
      slotInterval,
      minimumBookingNotice,
      beforeEventBuffer,
      afterEventBuffer,
      metadata,
      price,
      currency,
      lockTimeZoneToggleOnBookingPage,
      forwardParamsSuccessRedirect,
      successRedirectUrl,
      isInstantEvent,
      users,
      scheduleId,
      bookingLimitsCount,
      bookingLimitsDuration,
      onlyShowFirstAvailableSlot,
      offsetStart,
      bookingWindow,
      bookerLayouts,
      confirmationPolicy,
      requiresBookerEmailVerification,
      hideCalendarNotes,
      color,
      seats,
      customName,
      destinationCalendar,
      useDestinationCalendarEmail: useEventTypeDestinationCalendarEmail,
      hideCalendarEventDetails,
      hideOrganizerEmail,
      calVideoSettings: calVideoSettingsOutput,
      hidden,
      bookingRequiresAuthentication,
      bookerActiveBookingsLimit,
      bookingUrl,
      disableCancelling: disableCancellingOutput,
      disableRescheduling: disableReschedulingOutput,
      interfaceLanguage,
      allowReschedulingPastBookings,
      allowReschedulingCancelledBookings,
      showOptimizedSlots,
    };
  }

  transformBookerActiveBookingsLimit(databaseEventType: Input) {
    const noMaxActiveBookingsPerBooker =
      !databaseEventType.maxActiveBookingsPerBooker && databaseEventType.maxActiveBookingsPerBooker !== 0;
    const noMaxActiveBookingPerBookerOfferReschedule =
      !databaseEventType.maxActiveBookingPerBookerOfferReschedule;

    if (noMaxActiveBookingsPerBooker && noMaxActiveBookingPerBookerOfferReschedule) {
      return {
        disabled: true,
      };
    }

    return {
      maximumActiveBookings: databaseEventType.maxActiveBookingsPerBooker ?? undefined,
      offerReschedule: databaseEventType.maxActiveBookingPerBookerOfferReschedule ?? undefined,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transformLocations(locationDb: any) {
    if (!locationDb) return [];

    const knownLocations: InternalLocation[] = [];
    const unknownLocations: OutputUnknownLocation_2024_06_14[] = [];

    for (const location of locationDb) {
      const result = InternalLocationSchema.safeParse(location);
      if (result.success) {
        knownLocations.push(result.data);
      } else {
        unknownLocations.push({ type: "unknown", location: JSON.stringify(location) });
      }
    }

    return [...transformLocationsInternalToApi(knownLocations), ...unknownLocations];
  }

  transformDestinationCalendar(destinationCalendar?: DestinationCalendar | null) {
    if (!destinationCalendar) return undefined;
    return {
      integration: destinationCalendar.integration,
      externalId: destinationCalendar.externalId,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transformBookingFields(bookingFields: any) {
    if (!bookingFields) return [];

    const knownBookingFields: (SystemField | CustomField)[] = [];
    const unknownBookingFields: OutputUnknownBookingField_2024_06_14[] = [];

    for (const bookingField of bookingFields) {
      const result = BookingFieldSchema.safeParse(bookingField);
      if (result.success) {
        knownBookingFields.push(result.data);
      } else {
        unknownBookingFields.push({
          type: "unknown",
          slug: "unknown",
          bookingField: JSON.stringify(bookingField),
        } satisfies OutputUnknownBookingField_2024_06_14);
      }
    }

    return [...transformBookingFieldsInternalToApi(knownBookingFields), ...unknownBookingFields];
  }

  getDefaultBookingFields(isOrgTeamEvent: boolean) {
    const defaultBookingFields = getBookingFieldsWithSystemFields({
      disableGuests: false,
      bookingFields: null,
      customInputs: [],
      metadata: null,
      isOrgTeamEvent,
    });
    return this.transformBookingFields(defaultBookingFields);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transformRecurringEvent(recurringEvent: any) {
    if (!recurringEvent) return null;
    const recurringEventParsed = parseRecurringEvent(recurringEvent);
    if (!recurringEventParsed) return null;
    return transformRecurrenceInternalToApi(recurringEventParsed);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transformMetadata(metadata: any) {
    if (!metadata) return {};
    return EventTypeMetaDataSchema.parse(metadata);
  }

  transformUsers(users: EventTypeUser[]) {
    return users.map((user) => {
      const metadata = user.metadata ? userMetadata.parse(user.metadata) : {};
      return {
        id: user.id,
        name: user.name,
        username: user.username,
        avatarUrl: user.avatarUrl,
        brandColor: user.brandColor,
        darkBrandColor: user.darkBrandColor,
        weekStart: user.weekStart,
        metadata: metadata || {},
      };
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transformIntervalLimits(bookingLimits: any) {
    const bookingLimitsParsed = parseBookingLimit(bookingLimits);
    return transformIntervalLimitsInternalToApi(bookingLimitsParsed);
  }

  transformBookingWindow(bookingLimits: TransformFutureBookingsLimitSchema_2024_06_14) {
    return transformFutureBookingLimitsInternalToApi(bookingLimits);
  }

  transformBookerLayouts(bookerLayouts: BookerLayoutsTransformedSchema) {
    if (!bookerLayouts) return undefined;
    return transformBookerLayoutsInternalToApi(bookerLayouts);
  }

  transformRequiresConfirmation(
    requiresConfirmation: boolean,
    requiresConfirmationWillBlockSlot: boolean,
    requiresConfirmationThreshold?: NoticeThresholdTransformedSchema
  ) {
    return transformRequiresConfirmationInternalToApi(
      requiresConfirmation,
      requiresConfirmationWillBlockSlot,
      requiresConfirmationThreshold
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transformEventTypeColor(eventTypeColor: any) {
    if (!eventTypeColor) return undefined;
    const parsedeventTypeColor = parseEventTypeColor(eventTypeColor);
    if (!parsedeventTypeColor) return undefined;
    return transformEventTypeColorsInternalToApi(parsedeventTypeColor);
  }

  transformSeats(
    seatsPerTimeSlot: number | null,
    seatsShowAttendees: boolean | null,
    seatsShowAvailabilityCount: boolean | null
  ) {
    return transformSeatsInternalToApi({
      seatsPerTimeSlot,
      seatsShowAttendees: !!seatsShowAttendees,
      seatsShowAvailabilityCount: !!seatsShowAvailabilityCount,
    });
  }

  buildBookingUrl(user: EventTypeUser | undefined, slug: string): string {
    if (!user) {
      return "";
    }

    // Managed users don't have public booking pages
    if (user.isPlatformManaged) {
      return "";
    }

    const profile = this.usersService.getUserMainProfile(user);
    const org = profile?.organization;
    const isPlatformOrg = org?.isPlatform ?? false;

    // For platform orgs, use user.username (public username like 'dhairyashil')
    // For regular orgs, use profile.username (org-specific username)
    const username = isPlatformOrg ? user.username : (profile?.username ?? user.username);

    if (!username) {
      return "";
    }

    // Don't use org subdomain for platform organizations - they don't have public-facing subdomains
    const orgSlug = !isPlatformOrg && org?.slug ? org.slug : null;
    // getBookerBaseUrlSync(null) returns WEBSITE_URL (https://cal.com)
    const baseUrl = getBookerBaseUrlSync(orgSlug);
    const normalizedBaseUrl = baseUrl.replace(/\/$/, "");

    return `${normalizedBaseUrl}/${username}/${slug}`;
  }

  getResponseEventTypesWithoutHiddenFields(
    eventTypes: EventTypeOutput_2024_06_14[]
  ): EventTypeOutput_2024_06_14[] {
    return eventTypes.map((eventType) => this.getResponseEventTypeWithoutHiddenFields(eventType));
  }

  getResponseEventTypeWithoutHiddenFields(eventType: EventTypeOutput_2024_06_14): EventTypeOutput_2024_06_14 {
    if (!Array.isArray(eventType?.bookingFields) || eventType.bookingFields.length === 0) return eventType;

    const visibleBookingFields: OutputBookingField_2024_06_14[] = [];
    for (const bookingField of eventType.bookingFields) {
      if ("hidden" in bookingField && bookingField.hidden === true) {
        continue;
      }
      visibleBookingFields.push(bookingField);
    }
    return {
      ...eventType,
      bookingFields: visibleBookingFields,
    };
  }

  transformDisableRescheduling(
    disableRescheduling: boolean | null | undefined,
    minimumRescheduleNotice: number | null | undefined
  ) {
    // If disableRescheduling is true, rescheduling is always disabled
    if (disableRescheduling === true) {
      return { disabled: true };
    }

    // If minimumRescheduleNotice is set, rescheduling is conditionally disabled
    if (minimumRescheduleNotice && minimumRescheduleNotice > 0) {
      return { disabled: false, minutesBefore: minimumRescheduleNotice };
    }

    // Otherwise rescheduling is not disabled
    return { disabled: false };
  }

  transformDisableCancelling(
    disableCancelling: boolean | null | undefined,
    minimumCancellationNotice?: number | null | undefined
  ) {
    if (disableCancelling === true) {
      return { disabled: true };
    }

    if (minimumCancellationNotice && minimumCancellationNotice > 0) {
      return { disabled: false, minutesBefore: minimumCancellationNotice };
    }

    return { disabled: false };
  }

  transformCalVideoSettings(
    calVideoSettings: CalVideoSettings | null | undefined,
    canSendCalVideoTranscriptionEmails: boolean | null | undefined
  ) {
    if (!calVideoSettings && canSendCalVideoTranscriptionEmails === undefined) {
      return undefined;
    }

    return {
      ...calVideoSettings,
      sendTranscriptionEmails: canSendCalVideoTranscriptionEmails ?? true,
    };
  }
}
