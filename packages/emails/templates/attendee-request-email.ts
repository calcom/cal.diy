import { EMAIL_FROM_NAME } from "@calcom/lib/constants";
import { getReplyToHeader } from "@calcom/lib/getReplyToHeader";
import type { CalendarEvent, Person } from "@calcom/types/Calendar";
import renderEmail from "../src/renderEmail";
import AttendeeScheduledEmail from "./attendee-scheduled-email";

export default class AttendeeRequestEmail extends AttendeeScheduledEmail {
  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    const toAddresses = this.calEvent.attendees.map((attendee) => attendee.email);
    return {
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      to: toAddresses.join(","),
      ...getReplyToHeader(
        this.calEvent,
        this.calEvent.attendees.filter(({ email }) => email !== this.attendee.email).map(({ email }) => email)
      ),
      subject: `${this.calEvent.attendees[0].language.translate("booking_submitted_subject", {
        title: this.calEvent.title,
        date: this.getFormattedDate(),
      })}`,
      html: await this.getHtmlRequestEmail(this.calEvent, this.attendee),
      text: this.getTextBody(
        this.calEvent.attendees[0].language.translate("booking_submitted", {
          name: this.calEvent.attendees[0].name,
        }),
        this.calEvent.attendees[0].language.translate("user_needs_to_confirm_or_reject_booking", {
          user: this.calEvent.organizer.name,
          interpolation: { escapeValue: false },
        })
      ),
    };
  }

  async getHtmlRequestEmail(calEvent: CalendarEvent, attendee: Person) {
    return await renderEmail("AttendeeRequestEmail", {
      calEvent,
      attendee,
    });
  }
}
