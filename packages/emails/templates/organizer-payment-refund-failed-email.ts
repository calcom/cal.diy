import { EMAIL_FROM_NAME } from "@calcom/lib/constants";
import renderEmail from "../src/renderEmail";
import OrganizerScheduledEmail from "./organizer-scheduled-email";

export default class OrganizerPaymentRefundFailedEmail extends OrganizerScheduledEmail {
  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    const toAddresses = [this.teamMember?.email || this.calEvent.organizer.email];

    return {
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      to: toAddresses.join(","),
      subject: `${this.t("refund_failed_subject", {
        eventType: this.calEvent.type,
        name: this.calEvent.attendees[0].name,
        date: this.getFormattedDate(),
      })}`,
      html: await renderEmail("OrganizerPaymentRefundFailedEmail", {
        calEvent: this.calEvent,
        attendee: this.calEvent.organizer,
      }),
      text: this.getTextBody(
        "a_refund_failed",
        this.t("check_with_provider_and_user", {
          user: this.calEvent.attendees[0].name,
        }),
        this.calEvent.paymentInfo
          ? this.t("error_message", {
              errorMessage: this.calEvent.paymentInfo.reason,
            })
          : " "
      ),
    };
  }
}
