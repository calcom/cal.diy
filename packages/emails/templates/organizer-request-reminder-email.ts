import { EMAIL_FROM_NAME } from "@calcom/lib/constants";
import { getReplyToHeader } from "@calcom/lib/getReplyToHeader";
import renderEmail from "../src/renderEmail";
import OrganizerRequestEmail from "./organizer-request-email";

export default class OrganizerRequestReminderEmail extends OrganizerRequestEmail {
  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    const toAddresses = [this.teamMember?.email || this.calEvent.organizer.email];

    return {
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      to: toAddresses.join(","),
      ...getReplyToHeader(
        this.calEvent,
        this.calEvent.attendees.map(({ email }) => email),
        true
      ),
      subject: `${this.t("event_awaiting_approval_subject", {
        title: this.calEvent.title,
        date: this.getFormattedDate(),
      })}`,
      html: await renderEmail("OrganizerRequestReminderEmail", {
        calEvent: this.calEvent,
        attendee: this.calEvent.organizer,
      }),
      text: this.getTextBody("event_still_awaiting_approval"),
    };
  }
}
