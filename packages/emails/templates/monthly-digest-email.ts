import { APP_NAME, EMAIL_FROM_NAME } from "@calcom/lib/constants";
import renderEmail from "../src/renderEmail";
import type { MonthlyDigestEmailData } from "../src/templates/MonthlyDigestEmail";
import BaseEmail from "./_base-email";

export default class MonthlyDigestEmail extends BaseEmail {
  eventData: MonthlyDigestEmailData;

  constructor(eventData: MonthlyDigestEmailData) {
    super();
    this.eventData = eventData;
  }

  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    return {
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      to: this.eventData.admin.email,
      subject: `${APP_NAME}: Your monthly digest`,
      html: await renderEmail("MonthlyDigestEmail", this.eventData),
      text: "",
    };
  }
}
