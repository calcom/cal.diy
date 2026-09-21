import { getRichDescription } from "@calcom/lib/CalEventParser";
import { EMAIL_FROM_NAME } from "@calcom/lib/constants";
import { getReplyToHeader } from "@calcom/lib/getReplyToHeader";
import { TimeFormat } from "@calcom/lib/timeFormat";
import type { CalendarEvent, Person } from "@calcom/types/Calendar";
import type { TFunction } from "i18next";
import { default as cloneDeep } from "lodash/cloneDeep";
import generateIcsFile, { GenerateIcsRole } from "../lib/generateIcsFile";
import renderEmail from "../src/renderEmail";
import BaseEmail from "./_base-email";

export type Reassigned = { name: string | null; email: string; reason?: string; byUser?: string };
export default class OrganizerScheduledEmail extends BaseEmail {
  calEvent: CalendarEvent;
  t: TFunction;
  newSeat?: boolean;
  teamMember?: Person;
  reassigned?: Reassigned;
  attendee?: Person;

  constructor(input: {
    calEvent: CalendarEvent;
    newSeat?: boolean;
    teamMember?: Person;
    reassigned?: Reassigned;
    attendee?: Person;
  }) {
    super();
    this.name = "SEND_BOOKING_CONFIRMATION";
    this.calEvent = input.calEvent;
    this.t = this.calEvent.organizer.language.translate;
    this.newSeat = input.newSeat;
    this.teamMember = input.teamMember;
    this.reassigned = input.reassigned;
    this.attendee = input.attendee;
  }

  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    const clonedCalEvent = cloneDeep(this.calEvent);
    const toAddresses = [this.teamMember?.email || this.calEvent.organizer.email];

    return {
      icalEvent: generateIcsFile({
        calEvent: this.calEvent,
        role: GenerateIcsRole.ORGANIZER,
        status: "CONFIRMED",
      }),
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      to: toAddresses.join(","),
      ...getReplyToHeader(
        this.calEvent,
        this.calEvent.attendees.map(({ email }) => email),
        true
      ),
      subject: `${this.newSeat ? `${this.t("new_attendee")}: ` : ""}${this.calEvent.title}`,
      html: await this.getHtml(
        clonedCalEvent,
        this.attendee || this.calEvent.organizer,
        this.teamMember,
        this.newSeat,
        this.reassigned
      ),
      text: this.getTextBody(),
    };
  }

  async getHtml(
    calEvent: CalendarEvent,
    attendee: Person,
    teamMember?: Person,
    newSeat?: boolean,
    reassigned?: Reassigned
  ) {
    return await renderEmail("OrganizerScheduledEmail", {
      calEvent,
      attendee,
      teamMember,
      newSeat,
      reassigned,
    });
  }

  protected getTextBody(
    title = "",
    subtitle = "emailed_you_and_any_other_attendees",
    extraInfo = "",
    callToAction = ""
  ): string {
    return `
${this.t(
  title
    ? title
    : this.calEvent.recurringEvent?.count
      ? "new_event_scheduled_recurring"
      : "new_event_scheduled"
)}
${this.t(subtitle)}
${extraInfo}
${getRichDescription(this.calEvent, this.t, true)}
${callToAction}
`.trim();
  }

  protected getTimezone(): string {
    return this.calEvent.organizer.timeZone;
  }

  protected getLocale(): string {
    return this.calEvent.organizer.language.locale;
  }

  protected getOrganizerStart(format: string) {
    return this.getFormattedRecipientTime({
      time: this.calEvent.startTime,
      format,
    });
  }

  protected getOrganizerEnd(format: string) {
    return this.getFormattedRecipientTime({
      time: this.calEvent.endTime,
      format,
    });
  }

  protected getFormattedDate() {
    const organizerTimeFormat = this.calEvent.organizer.timeFormat || TimeFormat.TWELVE_HOUR;
    return `${this.getOrganizerStart(organizerTimeFormat)} - ${this.getOrganizerEnd(
      organizerTimeFormat
    )}, ${this.t(this.getOrganizerStart("dddd").toLowerCase())}, ${this.t(
      this.getOrganizerStart("MMMM").toLowerCase()
    )} ${this.getOrganizerStart("D, YYYY")}`;
  }
}
