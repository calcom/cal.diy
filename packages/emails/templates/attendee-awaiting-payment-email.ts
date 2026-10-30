import { getReplyToHeader } from "@calcom/lib/getReplyToHeader";
import renderEmail from "../src/renderEmail";
import AttendeeScheduledEmail from "./attendee-scheduled-email";

export default class AttendeeAwaitingPaymentEmail extends AttendeeScheduledEmail {
  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    return {
      to: `${this.attendee.name} <${this.attendee.email}>`,
      from: `${this.calEvent.organizer.name} <${this.getMailerOptions().from}>`,
      ...getReplyToHeader(this.calEvent),
      subject: `${this.attendee.language.translate("complete_your_booking_subject", {
        title: this.calEvent.title,
        date: this.getFormattedDate(),
      })}`,
      html: await renderEmail("AttendeeAwaitingPaymentEmail", {
        calEvent: this.calEvent,
        attendee: this.attendee,
      }),
      text: this.getTextBody("meeting_awaiting_payment"),
    };
  }
}
