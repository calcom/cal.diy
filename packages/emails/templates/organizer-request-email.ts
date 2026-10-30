import process from "node:process";
import { checkIfUserHasFeatureController } from "@calcom/features/flags/operations/check-if-user-has-feature.controller";
import { EMAIL_FROM_NAME } from "@calcom/lib/constants";
import { getReplyToHeader } from "@calcom/lib/getReplyToHeader";
import type { CalendarEvent, Person } from "@calcom/types/Calendar";
import renderEmail from "../src/renderEmail";
import OrganizerScheduledEmail from "./organizer-scheduled-email";

/**
 * TODO: Remove once fully migrated to V2
 */
async function getOrganizerRequestTemplate(userId?: number) {
  const hasNewTemplate = await checkIfUserHasFeatureController(userId, "organizer-request-email-v2");
  return hasNewTemplate ? ("OrganizerRequestEmailV2" as const) : ("OrganizerRequestEmail" as const);
}

export default class OrganizerRequestEmail extends OrganizerScheduledEmail {
  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    const toAddresses = [this.teamMember?.email || this.calEvent.organizer.email];
    const template = await getOrganizerRequestTemplate(this.calEvent.organizer.id);

    return {
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      to: toAddresses.join(","),
      ...getReplyToHeader(
        this.calEvent,
        this.calEvent.attendees.map(({ email }) => email),
        true
      ),
      subject: `${this.t("awaiting_approval")}: ${this.calEvent.title}`,
      html: await this.getHtmlRequestEmail(template, this.calEvent, this.calEvent.organizer),
      text: this.getTextBody("event_awaiting_approval"),
    };
  }

  protected getTextBody(title = "event_awaiting_approval"): string {
    return super.getTextBody(
      title,
      `${this.calEvent.organizer.language.translate("someone_requested_an_event")}`,
      "",
      `${this.calEvent.organizer.language.translate("confirm_or_reject_request")}
${process.env.NEXT_PUBLIC_WEBAPP_URL} + ${
        this.calEvent.recurringEvent?.count ? "/bookings/recurring" : "/bookings/upcoming"
      }`
    );
  }

  async getHtmlRequestEmail(
    template: "OrganizerRequestEmailV2" | "OrganizerRequestEmail",
    calEvent: CalendarEvent,
    attendee: Person
  ) {
    return await renderEmail(template, {
      calEvent,
      attendee,
    });
  }
}
