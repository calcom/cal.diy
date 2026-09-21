import { EMAIL_FROM_NAME } from "@calcom/lib/constants";
import type { CalendarEvent, Person } from "@calcom/types/Calendar";
import generateIcsFile, { GenerateIcsRole } from "../lib/generateIcsFile";
import renderEmail from "../src/renderEmail";
import type { Reassigned } from "./organizer-scheduled-email";
import OrganizerScheduledEmail from "./organizer-scheduled-email";

export default class OrganizerCancelledEmail extends OrganizerScheduledEmail {
  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    const toAddresses = [this.teamMember?.email || this.calEvent.organizer.email];
    const subject = this.reassigned ? "event_reassigned_subject" : "event_cancelled_subject";

    return {
      icalEvent: generateIcsFile({
        calEvent: this.calEvent,
        status: "CANCELLED",
        role: GenerateIcsRole.ORGANIZER,
      }),
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      to: toAddresses.join(","),
      subject: `${this.t(subject, {
        title: this.calEvent.title,
        date: this.getFormattedDate(),
      })}`,
      html: await this.getHtml(this.calEvent, this.calEvent.organizer, this.reassigned),
      text: this.getTextBody("event_request_cancelled"),
    };
  }

  async getHtml(calEvent: CalendarEvent, organizer: Person, reassigned: Reassigned | undefined) {
    return await renderEmail("OrganizerCancelledEmail", {
      calEvent,
      attendee: organizer,
      reassigned,
    });
  }
}
