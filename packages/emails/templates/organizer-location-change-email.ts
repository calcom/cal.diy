import { EMAIL_FROM_NAME } from "@calcom/lib/constants";
import { getReplyToHeader } from "@calcom/lib/getReplyToHeader";
import generateIcsFile, { GenerateIcsRole } from "../lib/generateIcsFile";
import renderEmail from "../src/renderEmail";
import OrganizerScheduledEmail from "./organizer-scheduled-email";

export default class OrganizerLocationChangeEmail extends OrganizerScheduledEmail {
  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    const toAddresses = [this.teamMember?.email || this.calEvent.organizer.email];

    return {
      icalEvent: generateIcsFile({
        calEvent: this.calEvent,
        role: GenerateIcsRole.ORGANIZER,
        status: "CONFIRMED",
      }),
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      to: toAddresses.join(","),
      ...getReplyToHeader(
        this.calEvent,
        this.calEvent.attendees.map(({ email }) => email),
        true
      ),
      subject: `${this.t("location_changed_event_type_subject", {
        eventType: this.calEvent.type,
        name: this.calEvent.attendees[0].name,
        date: this.getFormattedDate(),
      })}`,
      html: await renderEmail("OrganizerLocationChangeEmail", {
        attendee: this.calEvent.organizer,
        calEvent: this.calEvent,
      }),
      text: this.getTextBody("event_location_changed"),
    };
  }
}
