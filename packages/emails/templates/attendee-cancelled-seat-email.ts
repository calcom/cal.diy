import { getReplyToHeader } from "@calcom/lib/getReplyToHeader";
import renderEmail from "../src/renderEmail";
import AttendeeScheduledEmail from "./attendee-scheduled-email";

export default class AttendeeCancelledSeatEmail extends AttendeeScheduledEmail {
  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    return {
      to: `${this.attendee.name} <${this.attendee.email}>`,
      from: `${this.calEvent.organizer.name} <${this.getMailerOptions().from}>`,
      ...getReplyToHeader(this.calEvent),
      subject: `${this.t("event_no_longer_attending_subject", {
        title: this.calEvent.title,
        date: this.getFormattedDate(),
      })}`,
      html: await renderEmail("AttendeeCancelledSeatEmail", {
        calEvent: this.calEvent,
        attendee: this.attendee,
      }),
      text: this.getTextBody("event_request_cancelled", "emailed_you_and_any_other_attendees"),
    };
  }
}
