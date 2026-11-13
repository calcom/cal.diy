import { APP_NAME } from "@calcom/lib/constants";
import { getReplyToHeader } from "@calcom/lib/getReplyToHeader";
import generateIcsFile, { GenerateIcsRole } from "../lib/generateIcsFile";
import renderEmail from "../src/renderEmail";
import OrganizerScheduledEmail from "./organizer-scheduled-email";

export default class OrganizerAddGuestsEmail extends OrganizerScheduledEmail {
  async getHtml() {
    return await renderEmail("OrganizerAddGuestsEmail", {
      attendee: this.calEvent.organizer,
      calEvent: this.calEvent,
    });
  }

  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    const toAddresses = [this.teamMember?.email || this.calEvent.organizer.email];

    return {
      icalEvent: generateIcsFile({
        calEvent: this.calEvent,
        role: GenerateIcsRole.ORGANIZER,
        status: "CONFIRMED",
      }),
      from: `${APP_NAME} <${this.getMailerOptions().from}>`,
      to: toAddresses.join(","),
      ...getReplyToHeader(
        this.calEvent,
        this.calEvent.attendees.map(({ email }) => email),
        true
      ),
      subject: `${this.t("guests_added_event_type_subject", {
        eventType: this.calEvent.type,
        name: this.calEvent.attendees[0].name,
        date: this.getFormattedDate(),
      })}`,
      html: await this.getHtml(),
      text: this.getTextBody("new_guests_added"),
    };
  }
}
