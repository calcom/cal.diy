import { replaceCustomInputVariables } from "@calcom/features/eventtypes/lib/eventNaming";
import { getRichDescription } from "@calcom/lib/CalEventParser";
import { getReplyToHeader } from "@calcom/lib/getReplyToHeader";
import { TimeFormat } from "@calcom/lib/timeFormat";
import type { CalendarEvent, Person } from "@calcom/types/Calendar";
import type { TFunction } from "i18next";
import { default as cloneDeep } from "lodash/cloneDeep";
import generateIcsFile, { GenerateIcsRole } from "../lib/generateIcsFile";
import renderEmail from "../src/renderEmail";
import BaseEmail from "./_base-email";

export default class AttendeeScheduledEmail extends BaseEmail {
  calEvent: CalendarEvent;
  attendee: Person;
  showAttendees: boolean | undefined;
  t: TFunction;

  constructor(calEvent: CalendarEvent, attendee: Person, showAttendees?: boolean | undefined) {
    super();
    let shouldShowAttendees: boolean;
    if (showAttendees !== undefined) {
      shouldShowAttendees = showAttendees;
    } else if (calEvent.seatsPerTimeSlot) {
      shouldShowAttendees = calEvent.seatsShowAttendees ?? false;
    } else {
      shouldShowAttendees = true;
    }

    if (!shouldShowAttendees && calEvent.seatsPerTimeSlot) {
      this.calEvent = cloneDeep(calEvent);
      this.calEvent.attendees = [attendee];
    } else {
      this.calEvent = calEvent;
    }
    this.name = "SEND_BOOKING_CONFIRMATION";
    this.attendee = attendee;
    this.t = attendee.language.translate;
  }

  protected resolveCustomPlaceholders(text: string): string {
    const bookingFields =
      this.calEvent.responses || this.calEvent.userFieldsResponses || this.calEvent.customInputs || null;
    return replaceCustomInputVariables(text, bookingFields);
  }

  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    const clonedCalEvent = cloneDeep(this.calEvent);
    clonedCalEvent.title = this.resolveCustomPlaceholders(clonedCalEvent.title);
    if (clonedCalEvent.description) {
      clonedCalEvent.description = this.resolveCustomPlaceholders(clonedCalEvent.description);
    }
    if (clonedCalEvent.additionalNotes) {
      clonedCalEvent.additionalNotes = this.resolveCustomPlaceholders(clonedCalEvent.additionalNotes);
    }

    return {
      icalEvent: generateIcsFile({
        calEvent: clonedCalEvent,
        role: GenerateIcsRole.ATTENDEE,
        status: "CONFIRMED",
      }),
      to: `${this.attendee.name} <${this.attendee.email}>`,
      from: `${this.calEvent.organizer.name} <${this.getMailerOptions().from}>`,
      ...getReplyToHeader(
        this.calEvent,
        this.calEvent.attendees.filter(({ email }) => email !== this.attendee.email).map(({ email }) => email)
      ),
      subject: this.resolveCustomPlaceholders(this.calEvent.title),
      html: await this.getHtml(clonedCalEvent, this.attendee),
      text: this.getTextBody(),
    };
  }

  async getHtml(calEvent: CalendarEvent, attendee: Person) {
    return await renderEmail("AttendeeScheduledEmail", {
      calEvent,
      attendee,
    });
  }

  protected getTextBody(title = "", subtitle = "emailed_you_and_any_other_attendees"): string {
    const rawText = `
${this.t(
  title
    ? title
    : this.calEvent.recurringEvent?.count
      ? "your_event_has_been_scheduled_recurring"
      : "your_event_has_been_scheduled"
)}
${this.t(subtitle)}

${getRichDescription(this.calEvent, this.t)}
`.trim();
    return this.resolveCustomPlaceholders(rawText);
  }

  protected getTimezone(): string {
    return this.attendee.timeZone;
  }

  protected getLocale(): string {
    return this.attendee.language.locale;
  }

  protected getInviteeStart(format: string) {
    return this.getFormattedRecipientTime({
      time: this.calEvent.startTime,
      format,
    });
  }

  protected getInviteeEnd(format: string) {
    return this.getFormattedRecipientTime({
      time: this.calEvent.endTime,
      format,
    });
  }

  public getFormattedDate() {
    const inviteeTimeFormat = this.calEvent.organizer.timeFormat || TimeFormat.TWELVE_HOUR;

    return `${this.getInviteeStart(inviteeTimeFormat)} - ${this.getInviteeEnd(inviteeTimeFormat)}, ${this.t(
      this.getInviteeStart("dddd").toLowerCase()
    )}, ${this.t(this.getInviteeStart("MMMM").toLowerCase())} ${this.getInviteeStart("D, YYYY")}`;
  }
}
