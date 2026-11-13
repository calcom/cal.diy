import { getReplyToHeader } from "@calcom/lib/getReplyToHeader";
import type { CalendarEvent, Person } from "@calcom/types/Calendar";
import generateIcsFile, { GenerateIcsRole } from "../lib/generateIcsFile";
import renderEmail from "../src/renderEmail";
import AttendeeScheduledEmail from "./attendee-scheduled-email";

export default class AttendeeCancelledEmail extends AttendeeScheduledEmail {
  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    return {
      icalEvent: generateIcsFile({
        calEvent: this.calEvent,
        role: GenerateIcsRole.ATTENDEE,
        status: "CANCELLED",
      }),
      to: `${this.attendee.name} <${this.attendee.email}>`,
      from: `${this.calEvent.organizer.name} <${this.getMailerOptions().from}>`,
      ...getReplyToHeader(this.calEvent),
      subject: `${this.t("event_cancelled_subject", {
        title: this.calEvent.title,
        date: this.getFormattedDate(),
      })}`,
      html: await this.getHtml(this.calEvent, this.attendee),
      text: this.getTextBody("event_request_cancelled", "emailed_you_and_any_other_attendees"),
    };
  }

  async getHtml(calEvent: CalendarEvent, attendee: Person) {
    return await renderEmail("AttendeeCancelledEmail", {
      calEvent,
      attendee,
    });
  }
}
