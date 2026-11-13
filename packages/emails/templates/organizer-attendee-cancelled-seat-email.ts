import { EMAIL_FROM_NAME } from "@calcom/lib/constants";
import renderEmail from "../src/renderEmail";
import OrganizerScheduledEmail from "./organizer-scheduled-email";

export default class OrganizerCancelledEmail extends OrganizerScheduledEmail {
  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    const toAddresses = [this.calEvent.organizer.email];
    if (this.calEvent.team) {
      this.calEvent.team.members.forEach((member) => {
        const memberAttendee = this.calEvent.attendees.find((attendee) => attendee.email === member.email);
        if (memberAttendee) {
          toAddresses.push(memberAttendee.email);
        }
      });
    }

    return {
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      to: toAddresses.join(","),
      subject: `${this.t("event_cancelled_subject", {
        title: this.calEvent.title,
        date: this.getFormattedDate(),
      })}`,
      html: await renderEmail("OrganizerAttendeeCancelledSeatEmail", {
        attendee: this.attendee || this.calEvent.organizer,
        calEvent: this.calEvent,
      }),
      text: this.getTextBody("event_request_cancelled"),
    };
  }
}
