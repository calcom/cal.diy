import type { TFunction } from "i18next";

import { APP_NAME, COMPANY_NAME, EMAIL_FROM_NAME } from "@calcom/lib/constants";

import renderEmail from "../src/renderEmail";
import BaseEmail from "./_base-email";

export type ChangeOfEmailVerifyLink = {
  language: TFunction;
  user: {
    name?: string | null;
    emailFrom: string;
    emailTo: string;
  };
  verificationEmailLink: string;
};

export default class ChangeOfEmailVerifyEmail extends BaseEmail {
  changeEvent: ChangeOfEmailVerifyLink;

  constructor(changeEvent: ChangeOfEmailVerifyLink) {
    super();
    this.name = "SEND_ACCOUNT_VERIFY_EMAIL";
    this.changeEvent = changeEvent;
  }

  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    return {
      to: `${this.changeEvent.user.name} <${this.changeEvent.user.emailTo}>`,
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      subject: this.changeEvent.language("change_of_email", {
        appName: APP_NAME,
      }),
      html: await renderEmail("VerifyEmailChangeEmail", this.changeEvent),
      text: this.getTextBody(),
    };
  }

  protected getTextBody(): string {
    // Tags are stripped from the translated text only, so angle brackets in the user's name are kept.
    const text = (key: string, options?: Record<string, string>) =>
      this.changeEvent.language(key, options).replace(/(<([^>]+)>)/gi, "");

    return `
${text("verify_email_subject", { appName: APP_NAME })}
${text("verify_email_email_header")}
${this.changeEvent.language("hi_user_name", { name: this.changeEvent.user.name })},
${text("verify_email_change_description", { appName: APP_NAME })}
${text("old_email_address")}
${this.changeEvent.user.emailFrom},
${text("new_email_address")}
${this.changeEvent.user.emailTo},
${this.changeEvent.verificationEmailLink}
${text("happy_scheduling")} ${text("the_calcom_team", { companyName: COMPANY_NAME })}
`;
  }
}
