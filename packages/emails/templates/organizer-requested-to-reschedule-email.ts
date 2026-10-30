import { EMAIL_FROM_NAME } from "@calcom/lib/constants";
import type { CalendarEvent } from "@calcom/types/Calendar";
import generateIcsFile, { GenerateIcsRole } from "../lib/generateIcsFile";
import renderEmail from "../src/renderEmail";
import OrganizerScheduledEmail from "./organizer-scheduled-email";

export default class OrganizerRequestedToRescheduleEmail extends OrganizerScheduledEmail {
  private metadata: { rescheduleLink: string };
  constructor(calEvent: CalendarEvent, metadata: { rescheduleLink: string }) {
    super({ calEvent });
    this.metadata = metadata;
  }
  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    const toAddresses = [this.calEvent.organizer.email];

    return {
      icalEvent: generateIcsFile({
        calEvent: this.calEvent,
        role: GenerateIcsRole.ORGANIZER,
        status: "CANCELLED",
      }),
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      to: toAddresses.join(","),
      subject: `${this.t("rescheduled_event_type_subject", {
        eventType: this.calEvent.type,
        name: this.calEvent.attendees[0].name,
        date: this.getFormattedDate(),
      })}`,
      html: await renderEmail("OrganizerRequestedToRescheduleEmail", {
        calEvent: this.calEvent,
        attendee: this.calEvent.organizer,
      }),
      text: this.getTextBody(
        this.t("request_reschedule_title_organizer", {
          attendee: this.calEvent.attendees[0].name,
        }),
        this.t("request_reschedule_subtitle_organizer", {
          attendee: this.calEvent.attendees[0].name,
        })
      ),
    };
  }
}
