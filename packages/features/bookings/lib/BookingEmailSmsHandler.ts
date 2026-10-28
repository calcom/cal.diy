import dayjs from "@calcom/dayjs";
import type { BookingType } from "@calcom/features/bookings/lib/handleNewBooking/originalRescheduledBookingUtils";
import type { EventNameObjectType } from "@calcom/features/eventtypes/lib/eventNaming";
import { getTranslation } from "@calcom/i18n/server";
import { getPiiFreeCalendarEvent } from "@calcom/lib/piiFreeData";
import { safeStringify } from "@calcom/lib/safeStringify";
import { getTimeFormatStringFromUserTimeFormat } from "@calcom/lib/timeFormat";
import type { Prisma, User } from "@calcom/prisma/client";
import type { SchedulingType } from "@calcom/prisma/enums";
import type { EventTypeMetadata } from "@calcom/prisma/zod-utils";
import type { AdditionalInformation, CalendarEvent, Person } from "@calcom/types/Calendar";
import { default as cloneDeep } from "lodash/cloneDeep";
import type { Logger } from "tslog";
import { BookingStatus } from "@calcom/prisma/enums";

export const BookingActionMap = {
  confirmed: "BOOKING_CONFIRMED",
  rescheduled: "BOOKING_RESCHEDULED",
  requested: "BOOKING_REQUESTED",
} as const;

export type BookingActionType =
  | (typeof BookingActionMap)["confirmed"]
  | (typeof BookingActionMap)["rescheduled"]
  | (typeof BookingActionMap)["requested"];

type EmailAndSmsPayload = {
  evt: CalendarEvent;
  eventType: {
    metadata?: EventTypeMetadata;
    schedulingType: SchedulingType | null;
  };
};

type RescheduleEmailAndSmsPayload = EmailAndSmsPayload & {
  rescheduleReason?: string;
  additionalInformation: AdditionalInformation;
  additionalNotes: string | null | undefined;
  iCalUID: string;
  users: (Pick<User, "name" | "email"> & {
    isFixed?: boolean;
  })[];
  changedOrganizer?: boolean;
  isRescheduledByBooker: boolean;
  originalRescheduledBooking: NonNullable<BookingType>;
};

type ConfirmedEmailAndSmsPayload = EmailAndSmsPayload & {
  eventNameObject: EventNameObjectType;
  additionalInformation: AdditionalInformation;
  additionalNotes: string | null | undefined;
  customInputs: Prisma.JsonObject | null | undefined;
};

type RequestedEmailAndSmsPayload = EmailAndSmsPayload & {
  attendees?: Person[];
  additionalNotes?: string | null;
  originalRescheduledBooking?: NonNullable<BookingType>;
  rescheduleReason?: string;
};

type AddGuestsEmailAndSmsPayload = EmailAndSmsPayload & {
  newGuests: string[];
};

type RescheduledSideEffectsPayload = {
  action: typeof BookingActionMap.rescheduled;
  data: RescheduleEmailAndSmsPayload;
};

type ConfirmedSideEffectsPayload = {
  action: typeof BookingActionMap.confirmed;
  data: ConfirmedEmailAndSmsPayload;
};

type RequestedSideEffectsPayload = {
  action: typeof BookingActionMap.requested;
  data: RequestedEmailAndSmsPayload;
};

export type EmailsAndSmsSideEffectsPayload =
  | RescheduledSideEffectsPayload
  | RequestedSideEffectsPayload
  | ConfirmedSideEffectsPayload;

export interface IBookingEmailSmsHandler {
  logger: Pick<Logger<unknown>, "warn" | "debug" | "error" | "getSubLogger">;
}

export class BookingEmailSmsHandler {
  private readonly log: Pick<Logger<unknown>, "warn" | "debug" | "error">;

  constructor(dependencies: IBookingEmailSmsHandler) {
    this.log = dependencies.logger.getSubLogger({ prefix: ["BookingEmailSmsHandler"] });
  }

  public async send(payload: EmailsAndSmsSideEffectsPayload) {
    const { action, data } = payload;

    if (action === BookingActionMap.rescheduled) {
      if (data.eventType.schedulingType === "ROUND_ROBIN") return this._handleRoundRobinRescheduled(data);
      return this._handleRescheduled(data);
    }

    if (action === BookingActionMap.confirmed) return this._handleConfirmed(data);
    if (action === BookingActionMap.requested) return this._handleRequested(data);

    this.log.warn("Unknown email/SMS action requested.", { action });
  }

  /**
   * Handles notifications for a RESCHEDULED booking.
   */
  private async _handleRescheduled(data: RescheduleEmailAndSmsPayload) {
    const {
      evt,
      eventType: { metadata },
      rescheduleReason,
      additionalNotes,
      additionalInformation,
      originalRescheduledBooking,
    } = data;

    const { sendRescheduledEmailsAndSMS } = await import("@calcom/emails/email-manager");
    await sendRescheduledEmailsAndSMS(
      {
        ...evt,
        additionalInformation,
        additionalNotes,
        cancellationReason: `$RCH$${rescheduleReason || ""}`,
      },
      metadata,
      originalRescheduledBooking.status,
    );
  }

  /**
   * Handles notifications for a RESCHEDULED RR booking.
   */
  private async _handleRoundRobinRescheduled(data: RescheduleEmailAndSmsPayload) {
    const {
      evt,
      eventType: { metadata },
      originalRescheduledBooking,
      rescheduleReason,
      additionalNotes,
      changedOrganizer,
      additionalInformation,
      users,
      isRescheduledByBooker,
      iCalUID,
    } = data;
    const copyEvent = cloneDeep(evt);
    const copyEventAdditionalInfo = {
      ...copyEvent,
      additionalInformation,
      additionalNotes,
      cancellationReason: `$RCH$${rescheduleReason || ""}`,
    };
    const cancelledRRHostEvt = cloneDeep(copyEventAdditionalInfo);
    this.log.debug("Emails: Sending rescheduled emails for booking confirmation");

    const originalBookingMemberEmails: Person[] = [];

    for (const user of originalRescheduledBooking.attendees) {
      const translate = await getTranslation(user.locale ?? "en", "common");
      originalBookingMemberEmails.push({
        name: user.name,
        email: user.email,
        timeZone: user.timeZone,
        phoneNumber: user.phoneNumber,
        language: { translate, locale: user.locale ?? "en" },
      });
    }
    if (originalRescheduledBooking.user) {
      const translate = await getTranslation(originalRescheduledBooking.user.locale ?? "en", "common");
      const originalOrganizer = originalRescheduledBooking.user;

      originalBookingMemberEmails.push({
        ...originalRescheduledBooking.user,
        username: originalRescheduledBooking.user.username ?? undefined,
        timeFormat: getTimeFormatStringFromUserTimeFormat(originalRescheduledBooking.user.timeFormat),
        name: originalRescheduledBooking.user.name || "",
        language: { translate, locale: originalRescheduledBooking.user.locale ?? "en" },
      });

      if (changedOrganizer) {
        cancelledRRHostEvt.title = originalRescheduledBooking.title;
        cancelledRRHostEvt.startTime =
          dayjs(originalRescheduledBooking?.startTime).utc().format() || copyEventAdditionalInfo.startTime;
        cancelledRRHostEvt.endTime =
          dayjs(originalRescheduledBooking?.endTime).utc().format() || copyEventAdditionalInfo.endTime;
        cancelledRRHostEvt.organizer = {
          email: originalOrganizer.email,
          name: originalOrganizer.name || "",
          timeZone: originalOrganizer.timeZone,
          language: { translate, locale: originalOrganizer.locale || "en" },
        };
      }
    }

    const newBookingMemberEmails: Person[] = [
      ...(copyEvent.team?.members || []),
      copyEvent.organizer,
      ...copyEvent.attendees,
    ];

    const matchOriginalMemberWithNewMember = (originalMember: Person, newMember: Person) =>
      originalMember.email === newMember.email;

    const newBookedMembers = newBookingMemberEmails.filter(
      (member) => !originalBookingMemberEmails.some((om) => matchOriginalMemberWithNewMember(om, member))
    );
    const cancelledMembers = originalBookingMemberEmails.filter(
      (member) => !newBookingMemberEmails.some((nm) => matchOriginalMemberWithNewMember(member, nm))
    );
    const rescheduledMembers = newBookingMemberEmails.filter((member) =>
      originalBookingMemberEmails.some((om) => matchOriginalMemberWithNewMember(om, member))
    );

    const reassignedTo = users.find(
      (user) => !user.isFixed && newBookedMembers.some((member) => member.email === user.email)
    );

    const {
      sendRoundRobinRescheduledEmailsAndSMS,
      sendReassignedScheduledEmailsAndSMS,
      sendRoundRobinCancelledEmailsAndSMS,
    } = await import("@calcom/emails/email-manager");

    try {
      await Promise.all([
        sendRoundRobinRescheduledEmailsAndSMS(
          { ...copyEventAdditionalInfo, iCalUID },
          rescheduledMembers,
          metadata
        ),
        sendReassignedScheduledEmailsAndSMS({
          calEvent: copyEventAdditionalInfo,
          members: newBookedMembers,
          eventTypeMetadata: metadata,
        }),
        sendRoundRobinCancelledEmailsAndSMS(
          cancelledRRHostEvt,
          cancelledMembers,
          metadata,
          reassignedTo
            ? {
                name: reassignedTo.name,
                email: reassignedTo.email,
                ...(isRescheduledByBooker && { reason: "Booker Rescheduled" }),
              }
            : undefined
        ),
      ]);
    } catch (err) {
      this.log.error("Failed to send rescheduled round robin event related emails", err);
    }
  }

  /**
   * Handles notifications for a newly CONFIRMED booking.
   */
  private async _handleConfirmed(data: ConfirmedEmailAndSmsPayload) {
    const {
      evt,
      eventType: { metadata },
      eventNameObject,
      additionalInformation,
      additionalNotes,
      customInputs,
    } = data;

    const isHostConfirmationEmailsDisabled = metadata?.disableStandardEmails?.confirmation?.host || false;
    const isAttendeeConfirmationEmailDisabled =
      metadata?.disableStandardEmails?.confirmation?.attendee || false;

    const { sendScheduledEmailsAndSMS } = await import("@calcom/emails/email-manager");

    try {
      await sendScheduledEmailsAndSMS(
        { ...evt, additionalInformation, additionalNotes, customInputs },
        eventNameObject,
        isHostConfirmationEmailsDisabled,
        isAttendeeConfirmationEmailDisabled,
        metadata
      );
    } catch (err) {
      this.log.error("Failed to send scheduled event related emails", err);
    }
  }

  /**
   * Handles notifications when a booking REQUEST is made (requires confirmation).
   */
  private async _handleRequested(data: RequestedEmailAndSmsPayload) {
    const {
      evt,
      eventType: { metadata },
      attendees,
      additionalNotes,
      originalRescheduledBooking,
      rescheduleReason,
    } = data;
    if (!attendees?.length) {
      this.log.error("Requested action called without attendee details.");
      return;
    }

    if (originalRescheduledBooking?.status === BookingStatus.PENDING) {
    this.log.debug(
      "Action: BOOKING_REQUESTED via pending reschedule. Sending rescheduled pending emails.",
      safeStringify({ calEvent: getPiiFreeCalendarEvent(evt) })
    );

    const { sendRescheduledEmailsAndSMS } = await import("@calcom/emails/email-manager");

    try {
      await sendRescheduledEmailsAndSMS(
        {
          ...evt,
          additionalNotes,
          cancellationReason: `$RCH$${rescheduleReason || ""}`,
        },
        metadata,
        originalRescheduledBooking.status,
      );
    } catch (err) {
      this.log.error("Failed to send pending reschedule emails", err);
    }
    return;
  }

    this.log.debug(
      "Action: BOOKING_REQUESTED. Sending request emails.",
      safeStringify({ calEvent: getPiiFreeCalendarEvent(evt) })
    );

    const eventWithNotes = { ...evt, additionalNotes };

    const { sendOrganizerRequestEmail, sendAttendeeRequestEmailAndSMS } = await import(
      "@calcom/emails/email-manager"
    );

    try {
      await Promise.all([
        sendOrganizerRequestEmail(eventWithNotes, metadata),
        sendAttendeeRequestEmailAndSMS(eventWithNotes, attendees[0], metadata),
      ]);
    } catch (err) {
      this.log.error("Failed to send requested event related emails", err);
    }
  }

  /**
   * Handles notifications when a single attendee is added to an existing booking.
   */
  public async handleAddAttendee(data: AddGuestsEmailAndSmsPayload) {
    const {
      evt,
      eventType: { metadata },
      newGuests,
    } = data;

    this.log.debug(
      "Action: ADD_ATTENDEE. Sending add attendee emails and SMS.",
      safeStringify({ calEvent: getPiiFreeCalendarEvent(evt) })
    );

    const { sendAddGuestsEmailsAndSMS } = await import("@calcom/emails/email-manager");

    try {
      await sendAddGuestsEmailsAndSMS({
        calEvent: evt,
        newGuests,
        eventTypeMetadata: metadata,
      });
    } catch (err) {
      this.log.error("Failed to send add attendee related emails and SMS", err);
    }
  }

  /**
   * Handles notifications when guests are added to an existing booking.
   */
  public async handleAddGuests(data: AddGuestsEmailAndSmsPayload) {
    const {
      evt,
      eventType: { metadata },
      newGuests,
    } = data;

    this.log.debug(
      "Action: ADD_GUESTS. Sending add guests emails and SMS.",
      safeStringify({ calEvent: getPiiFreeCalendarEvent(evt) })
    );

    const { sendAddGuestsEmailsAndSMS } = await import("@calcom/emails/email-manager");

    try {
      await sendAddGuestsEmailsAndSMS({
        calEvent: evt,
        newGuests,
        eventTypeMetadata: metadata,
      });
    } catch (err) {
      this.log.error("Failed to send add guests related emails and SMS", err);
    }
  }
}
