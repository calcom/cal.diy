import { EMAIL_FROM_NAME } from "@calcom/lib/constants";
import type { CalendarEvent, Person } from "@calcom/types/Calendar";
import generateIcsFile, { GenerateIcsRole } from "../lib/generateIcsFile";
import renderEmail from "../src/renderEmail";
import type { Reassigned } from "./organizer-scheduled-email";
import OrganizerScheduledEmail from "./organizer-scheduled-email";

export default class OrganizerReassignedEmail extends OrganizerScheduledEmail {
  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    const toAddresses = [this.teamMember?.email || this.calEvent.organizer.email];

    return {
      icalEvent: generateIcsFile({
        calEvent: this.calEvent,
        status: "CANCELLED",
        role: GenerateIcsRole.ORGANIZER,
      }),
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      to: toAddresses.join(","),
      subject: `${this.t("event_reassigned_subject", {
        title: this.calEvent.title,
        date: this.getFormattedDate(),
      })}`,
      html: await this.getHtml(this.calEvent, this.calEvent.organizer, this.reassigned),
      text: this.getTextBody("event_request_reassigned"),
    };
  }

  async getHtml(calEvent: CalendarEvent, attendee: Person, reassigned: Reassigned | undefined) {
    return await renderEmail("OrganizerReassignedEmail", {
      calEvent,
      attendee,
      reassigned,
    });
  }
}
