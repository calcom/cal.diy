import { getManageLink } from "@calcom/lib/CalEventParser";
import { EMAIL_FROM_NAME } from "@calcom/lib/constants";
import type { CalendarEvent } from "@calcom/types/Calendar";

import generateIcsFile, { GenerateIcsRole } from "../lib/generateIcsFile";
import renderEmail from "../src/renderEmail";
import OrganizerScheduledEmail from "./organizer-scheduled-email";

export default class AttendeeWasRequestedToRescheduleEmail extends OrganizerScheduledEmail {
  private metadata: { rescheduleLink: string };
  constructor(calEvent: CalendarEvent, metadata: { rescheduleLink: string }) {
    super({ calEvent });
    this.metadata = metadata;
    this.t = this.calEvent.attendees[0].language.translate;
  }
  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    const toAddresses = [this.calEvent.attendees[0].email];

    return {
      icalEvent: generateIcsFile({
        calEvent: this.calEvent,
        role: GenerateIcsRole.ATTENDEE,
        status: "CANCELLED",
      }),
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      to: toAddresses.join(","),
      subject: `${this.t("requested_to_reschedule_subject_attendee", {
        eventType: this.calEvent.type,
        name: this.calEvent.attendees[0].name,
      })}`,
      html: await renderEmail("AttendeeWasRequestedToRescheduleEmail", {
        calEvent: this.calEvent,
        attendee: this.calEvent.attendees[0],
        metadata: this.metadata,
      }),
      text: this.getTextBody(),
    };
  }

  // @OVERRIDE
  protected getWhen(): string {
    return `
    <p style="height: 6px"></p>
    <div style="line-height: 6px;">
      <p style="color: #494949;">${this.t("when")}</p>
      <p style="color: #494949; font-weight: 400; line-height: 24px;text-decoration: line-through;">
      ${this.t(this.getOrganizerStart("dddd").toLowerCase())}, ${this.t(
        this.getOrganizerStart("MMMM").toLowerCase()
      )} ${this.getOrganizerStart("D")}, ${this.getOrganizerStart("YYYY")} | ${this.getOrganizerStart(
        "h:mma"
      )} - ${this.getOrganizerEnd("h:mma")} <span style="color: #888888">(${this.getTimezone()})</span>
      </p>
    </div>`;
  }

  protected getTextBody(): string {
    // Tags are stripped from the translated text and the HTML snippet only, so angle brackets in the organizer's name are kept.
    const stripTags = (value: string) => value.replace(/(<([^>]+)>)/gi, "");
    const text = (key: string, options?: Record<string, string>) => stripTags(this.t(key, options));

    return `
${text("request_reschedule_booking")}
${this.t("request_reschedule_subtitle", {
  organizer: this.calEvent.organizer.name,
})},
${stripTags(this.getWhen())}
${text("need_to_reschedule_or_cancel")}
${stripTags(getManageLink(this.calEvent, this.t))}
`;
  }
}
