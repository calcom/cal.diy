import { getReplyToHeader } from "@calcom/lib/getReplyToHeader";
import generateIcsFile, { GenerateIcsRole } from "../lib/generateIcsFile";
import renderEmail from "../src/renderEmail";
import AttendeeScheduledEmail from "./attendee-scheduled-email";

export default class AttendeeAddGuestsEmail extends AttendeeScheduledEmail {
  async getHtml() {
    return await renderEmail("AttendeeAddGuestsEmail", {
      calEvent: this.calEvent,
      attendee: this.attendee,
    });
  }

  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    return {
      icalEvent: generateIcsFile({
        calEvent: this.calEvent,
        role: GenerateIcsRole.ATTENDEE,
        status: "CONFIRMED",
      }),
      to: `${this.attendee.name} <${this.attendee.email}>`,
      from: `${this.calEvent.organizer.name} <${this.getMailerOptions().from}>`,
      ...getReplyToHeader(this.calEvent),
      subject: `${this.t("guests_added_event_type_subject", {
        eventType: this.calEvent.type,
        name: this.calEvent.team?.name || this.calEvent.organizer.name,
        date: this.getFormattedDate(),
      })}`,
      html: await this.getHtml(),
      text: this.getTextBody("new_guests_added"),
    };
  }
}
