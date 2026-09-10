import process from "node:process";
import { ALL_APPS } from "@calcom/app-store/utils";
import { getAssignmentReasonCategory } from "@calcom/features/bookings/lib/getAssignmentReasonCategory";
import { getCalEventResponses } from "@calcom/features/bookings/lib/getCalEventResponses";
import type { BookingRepository } from "@calcom/features/bookings/repositories/BookingRepository";
import {
  type EventTypeBrandingData,
  getEventTypeService,
} from "@calcom/features/eventtypes/di/EventTypeService.container";
import { getTranslation } from "@calcom/i18n/server";
import { parseRecurringEvent } from "@calcom/lib/isRecurringEvent";
import { getTimeFormatStringFromUserTimeFormat } from "@calcom/lib/timeFormat";
import type {
  Attendee,
  BookingReference,
  BookingSeat,
  DestinationCalendar,
  Prisma,
  User,
} from "@calcom/prisma/client";
import type { SchedulingType } from "@calcom/prisma/enums";
import { bookingResponses as bookingResponsesSchema } from "@calcom/prisma/zod-utils";
import type { AppsStatus, CalEventResponses, CalendarEvent, Person } from "@calcom/types/Calendar";
import type { VideoCallData } from "@calcom/types/VideoApiAdapter";
import type { TFunction } from "i18next";

const getBookerBaseUrl = async (_orgSlug?: string | number | null): Promise<string> =>
  process.env.NEXT_PUBLIC_WEBAPP_URL || "https://app.cal.com";

type CalendarEventRequiredFields = Required<
  Pick<CalendarEvent, "startTime" | "endTime" | "type" | "bookerUrl" | "title" | "organizer" | "attendees">
>;
type CalendarEventBuilderInit = CalendarEventRequiredFields & Partial<CalendarEvent>;
const APP_TYPE_TO_NAME_MAP = new Map<string, string>(ALL_APPS.map((app) => [app.type, app.name]));

async function _buildPersonFromUser(
  user: Pick<User, "id" | "name" | "locale" | "username" | "email" | "timeFormat" | "timeZone">
) {
  const translate = await getTranslation(user.locale ?? "en", "common");
  return {
    id: user.id,
    name: user.name || "Nameless",
    email: user.email,
    username: user.username || undefined,
    timeZone: user.timeZone,
    language: { translate, locale: user.locale ?? "en" },
    timeFormat: getTimeFormatStringFromUserTimeFormat(user.timeFormat),
  } satisfies Person;
}

async function _buildPersonFromAttendee(
  attendee: Pick<Attendee, "locale" | "name" | "timeZone" | "email" | "phoneNumber"> & {
    bookingSeat: Pick<
      BookingSeat,
      "id" | "referenceUid" | "bookingId" | "metadata" | "data" | "attendeeId"
    > | null;
  }
) {
  const translate = await getTranslation(attendee.locale ?? "en", "common");

  return {
    name: attendee.name ?? "",
    email: attendee.email,
    timeZone: attendee.timeZone,
    language: { translate, locale: attendee.locale ?? "en" },
    phoneNumber: attendee.phoneNumber,
    bookingSeat: attendee.bookingSeat,
  } satisfies Person;
}

export type BuiltCalendarEvent = Omit<CalendarEvent, "bookerUrl"> & { bookerUrl: string };
export type BookingForCalEventBuilder = NonNullable<
  Awaited<ReturnType<BookingRepository["getBookingForCalEventBuilder"]>>
>;
export type BookingMetaOptions = {
  conferenceCredentialId?: number;
  platformClientId?: string;
  platformRescheduleUrl?: string;
  platformCancelUrl?: string;
  platformBookingUrl?: string;
};

export class CalendarEventBuilder {
  private event: CalendarEventBuilderInit;

  constructor(existingEvent: CalendarEventBuilderInit) {
    this.event = existingEvent;
  }

  static fromEvent(event: CalendarEventBuilderInit) {
    return new CalendarEventBuilder(event);
  }

  /**
   * Builds a CalendarEventBuilder instance from a booking.
   */
  static async fromBooking(
    booking: BookingForCalEventBuilder,
    meta: BookingMetaOptions = {}
  ): Promise<CalendarEventBuilder> {
    const { uid, user, eventType } = booking;

    if (!user) throw new Error(`Booking ${uid} is missing an organizer — user may have been deleted.`);
    if (!eventType) throw new Error(`Booking ${uid} is missing eventType — it may have been deleted.`);

    const {
      description,
      attendees,
      references,
      title,
      startTime,
      endTime,
      location,
      responses,
      customInputs,
      iCalUID,
      iCalSequence,
      oneTimePassword,
      seatsReferences,
      assignmentReason,
    } = booking;

    const {
      conferenceCredentialId,
      platformRescheduleUrl = "",
      platformClientId = "",
      platformCancelUrl = "",
      platformBookingUrl = "",
    } = meta;

    const organizerPerson = await _buildPersonFromUser(user);
    const attendeesList = await Promise.all(attendees.map(_buildPersonFromAttendee));
    const additionalNotes = description || undefined;

    const videoRef = references.find((r) => r.type.endsWith("_video"));
    const videoCallData = videoRef
      ? {
          type: videoRef.type,
          id: videoRef.meetingId,
          password: videoRef.meetingPassword,
          url: videoRef.meetingUrl,
        }
      : undefined;
    const appsStatus: AppsStatus[] = [];

    const organizationId = user.profiles?.[0]?.organizationId ?? null;
    const bookerUrl = await getBookerBaseUrl(eventType.team?.parentId ?? organizationId);

    const parsedBookingResponses = bookingResponsesSchema.safeParse(responses);
    const bookingResponses = parsedBookingResponses.success ? parsedBookingResponses.data : null;

    const calEventResponses = getCalEventResponses({
      booking,
      bookingFields: eventType.bookingFields,
    });

    // custom inputs are the old system to record booking responses
    const parsedCustomInputs =
      typeof customInputs === "object" ? (customInputs as Record<string, string>) : null;

    const recurring = parseRecurringEvent(eventType.recurringEvent) ?? undefined;

    const builder = new CalendarEventBuilder({
      bookerUrl,
      title,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      type: eventType.slug,
      organizer: organizerPerson,
      attendees: attendeesList,
      additionalNotes,
    });

    // Base builder setup
    builder
      .withEventType({
        id: eventType.id,
        description: eventType.description,
        hideCalendarNotes: eventType.hideCalendarNotes,
        hideCalendarEventDetails: eventType.hideCalendarEventDetails,
        hideOrganizerEmail: eventType.hideOrganizerEmail,
        schedulingType: eventType.schedulingType,
        seatsPerTimeSlot: eventType.seatsPerTimeSlot,
        seatsShowAttendees: !!eventType.seatsShowAttendees,
        seatsShowAvailabilityCount: !!eventType.seatsShowAvailabilityCount,
        customReplyToEmail: eventType.customReplyToEmail,
        disableRescheduling: eventType.disableRescheduling ?? false,
        disableCancelling: eventType.disableCancelling ?? false,
        metadata: eventType.metadata as { confirmationEmailSubject?: string | null } | null,
      })
      .withMetadataAndResponses({
        additionalNotes,
        customInputs: parsedCustomInputs,
        responses: calEventResponses.responses,
        userFieldsResponses: calEventResponses.userFieldsResponses,
      })
      .withLocation({ location, conferenceCredentialId })
      .withIdentifiers({ iCalUID: iCalUID || undefined, iCalSequence })
      .withConfirmation({
        requiresConfirmation: !!eventType.requiresConfirmation,
        isConfirmedByDefault: !eventType.requiresConfirmation,
      })
      .withPlatformVariables({
        platformClientId,
        platformRescheduleUrl,
        platformCancelUrl,
        platformBookingUrl,
      })
      .withRecurring(recurring)
      .withUid(uid)
      .withOneTimePassword(oneTimePassword)
      .withOrganization(organizationId)
      .withAssignmentReason(
        assignmentReason?.[0]?.reasonEnum
          ? {
              category: getAssignmentReasonCategory(assignmentReason[0].reasonEnum),
              details: assignmentReason[0].reasonString ?? null,
            }
          : null
      )
      .withHideBranding(
        await getEventTypeService().shouldHideBrandingForEventType(eventType.id, {
          team: eventType.team
            ? { hideBranding: eventType.team.hideBranding, parent: eventType.team.parent }
            : null,
          owner: {
            id: user.id,
            hideBranding: user.hideBranding,
            profiles: user.profiles ?? [],
          },
        } satisfies EventTypeBrandingData)
      );

    // Seats
    if (seatsReferences?.length && bookingResponses) {
      const currentSeat = seatsReferences.find(
        (s) =>
          s.attendee.email === bookingResponses.email ||
          (bookingResponses.attendeePhoneNumber &&
            s.attendee.phoneNumber === bookingResponses.attendeePhoneNumber)
      );
      if (currentSeat) builder.withAttendeeSeatId(currentSeat.referenceUid);
    }

    // Video
    if (videoCallData?.url) {
      builder.withVideoCallData({
        ...videoCallData,
        id: videoCallData.id ?? "",
        password: videoCallData.password ?? "",
        url: videoCallData.url,
      });
    }

    references
      .filter((r) => r?.type)
      .forEach((ref) => {
        const appName = APP_TYPE_TO_NAME_MAP.get(ref.type) || ref.type.replace("_", "-");
        appsStatus.push({
          appName,
          type: ref.type,
          success: ref.uid ? 1 : 0,
          failures: ref.uid ? 0 : 1,
          errors: [],
        });
      });

    if (appsStatus.length) {
      builder.withAppsStatus(appsStatus);
    }

    // Team & calendars
    if (eventType.team) {
      // We need to get the team members assigned to the booking
      // In the DB team members are stored in the Attendee table
      const bookingAttendees = booking.attendees;

      const hostsToInclude = eventType.hosts.filter((host) =>
        bookingAttendees.some((attendee) => attendee.email === host.user.email)
      );

      const hostsWithoutOrganizerData = hostsToInclude.filter((host) => host.user.email !== user.email);

      const hostsWithoutOrganizer = await Promise.all(
        hostsWithoutOrganizerData.map((host) => _buildPersonFromUser(host.user))
      );

      const hostCalendars = [
        user.destinationCalendar,
        ...hostsWithoutOrganizerData.map((h) => h.user.destinationCalendar).filter(Boolean),
        user.destinationCalendar,
      ].filter(Boolean) as NonNullable<DestinationCalendar>[];

      builder
        .withTeam({
          id: eventType.team.id,
          name: eventType.team.name || "",
          members: hostsWithoutOrganizer,
        })
        .withDestinationCalendar(hostCalendars);
    } else if (user.destinationCalendar) {
      builder.withDestinationCalendar([user.destinationCalendar]);
    }

    return builder;
  }

  withEventType(eventType: {
    description?: string | null;
    id: number;
    hideCalendarNotes?: boolean;
    hideCalendarEventDetails?: boolean;
    hideOrganizerEmail?: boolean;
    schedulingType?: SchedulingType | null;
    seatsPerTimeSlot?: number | null;
    seatsShowAttendees?: boolean | null;
    seatsShowAvailabilityCount?: boolean | null;
    customReplyToEmail?: string | null;
    disableRescheduling?: boolean;
    disableCancelling?: boolean;
    metadata?: { confirmationEmailSubject?: string | null } | null;
  }) {
    this.event = {
      ...this.event,
      description: eventType.description,
      eventTypeId: eventType.id,
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
      customEmailSubject: (eventType.metadata as Record<string, unknown> | null)?.confirmationEmailSubject as string | null ?? null,
    };
    return this;
  }

  withMetadataAndResponses({
    additionalNotes,
    customInputs,
    responses,
    userFieldsResponses,
  }: {
    additionalNotes?: string | null;
    customInputs?: Prisma.JsonObject | null;
    responses?: CalEventResponses | null;
    userFieldsResponses?: CalEventResponses | null;
  }) {
    this.event = {
      ...this.event,
      additionalNotes,
      customInputs,
      responses,
      userFieldsResponses,
    };
    return this;
  }

  withLocation({
    location,
    conferenceCredentialId,
  }: {
    location: string | null;
    conferenceCredentialId?: number;
  }) {
    this.event = {
      ...this.event,
      location,
      conferenceCredentialId,
    };
    return this;
  }

  withDestinationCalendar(destinationCalendar: CalendarEvent["destinationCalendar"]) {
    this.event = {
      ...this.event,
      destinationCalendar,
    };
    return this;
  }

  withIdentifiers({ iCalUID, iCalSequence }: { iCalUID?: string; iCalSequence?: number }) {
    this.event = {
      ...this.event,
      iCalUID: iCalUID ?? this.event.iCalUID,
      iCalSequence: iCalSequence ?? this.event.iCalSequence,
    };
    return this;
  }

  withConfirmation({
    requiresConfirmation,
    isConfirmedByDefault,
  }: {
    requiresConfirmation: boolean;
    isConfirmedByDefault: boolean;
  }) {
    this.event = {
      ...this.event,
      requiresConfirmation,
      oneTimePassword: isConfirmedByDefault ? null : undefined,
    };
    return this;
  }

  withPlatformVariables({
    platformClientId,
    platformRescheduleUrl,
    platformCancelUrl,
    platformBookingUrl,
  }: {
    platformClientId?: string | null;
    platformRescheduleUrl?: string | null;
    platformCancelUrl?: string | null;
    platformBookingUrl?: string | null;
  }) {
    this.event = {
      ...this.event,
      platformClientId,
      platformRescheduleUrl,
      platformCancelUrl,
      platformBookingUrl,
    };
    return this;
  }

  withAppsStatus(appsStatus?: AppsStatus[]) {
    this.event = {
      ...this.event,
      appsStatus,
    };
    return this;
  }

  withVideoCallData(videoCallData?: VideoCallData) {
    this.event = {
      ...this.event,
      videoCallData,
    };
    return this;
  }

  withTeam(team?: { name: string; members: Person[]; id: number }) {
    if (!team) {
      return this;
    }
    this.event = {
      ...this.event,
      team,
    };
    return this;
  }

  withRecurring(recurringEvent?: { count: number; freq: number; interval: number }) {
    this.event = {
      ...this.event,
      recurringEvent,
    };
    return this;
  }

  withAttendeeSeatId(attendeeSeatId?: string) {
    this.event = {
      ...this.event,
      attendeeSeatId,
    };
    return this;
  }

  withUid(uid: string | null) {
    this.event = {
      ...this.event,
      uid,
    };
    return this;
  }

  withRecurringEventId(recurringEventId?: string | null) {
    if (!recurringEventId) {
      return this;
    }
    this.event = {
      ...this.event,
      existingRecurringEvent: {
        recurringEventId,
      },
    };
    return this;
  }

  withOneTimePassword(oneTimePassword?: string | null) {
    this.event = {
      ...this.event,
      oneTimePassword,
    };
    return this;
  }

  withOrganization(organizationId?: number | null) {
    this.event = {
      ...this.event,
      organizationId,
    };
    return this;
  }

  withHashedLink(hashedLink?: string | null) {
    this.event = {
      ...this.event,
      hashedLink,
    };
    return this;
  }

  withAssignmentReason(assignmentReason?: { category: string; details?: string | null } | null) {
    this.event = {
      ...this.event,
      assignmentReason,
    };
    return this;
  }

  withHideBranding(hideBranding?: boolean) {
    this.event = {
      ...this.event,
      hideBranding,
    };
    return this;
  }

  withVideoCallDataFromReferences(bookingReferences: BookingReference[]): this {
    const videoCallReference = bookingReferences.find((reference) => reference.type.includes("_video"));

    if (videoCallReference) {
      this.event = {
        ...this.event,
        videoCallData: {
          type: videoCallReference.type,
          id: videoCallReference.meetingId,
          password: videoCallReference?.meetingPassword,
          url: videoCallReference.meetingUrl,
        },
      };
    }
    return this;
  }

  build(): BuiltCalendarEvent {
    return this.event;
  }
}
