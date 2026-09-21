import { APP_NAME, COMPANY_NAME, EMAIL_FROM_NAME } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
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
    return `
${this.changeEvent.language("verify_email_subject", { appName: APP_NAME })}
${this.changeEvent.language("verify_email_email_header")}
${this.changeEvent.language("hi_user_name", { name: this.changeEvent.user.name })},
${this.changeEvent.language("verify_email_change_description", { appName: APP_NAME })}
${this.changeEvent.language("old_email_address")}
${this.changeEvent.user.emailFrom},
${this.changeEvent.language("new_email_address")}
${this.changeEvent.user.emailTo},
${this.changeEvent.verificationEmailLink}
${this.changeEvent.language("happy_scheduling")} ${this.changeEvent.language("the_calcom_team", {
      companyName: COMPANY_NAME,
    })}
`.replace(/(<([^>]+)>)/gi, "");
  }
}
