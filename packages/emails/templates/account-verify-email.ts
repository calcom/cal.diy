import { APP_NAME, COMPANY_NAME, EMAIL_FROM_NAME } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
import renderEmail from "../src/renderEmail";
import BaseEmail from "./_base-email";

export type EmailVerifyLink = {
  language: TFunction;
  user: {
    name?: string | null;
    email: string;
  };
  verificationEmailLink: string;
  isSecondaryEmailVerification?: boolean;
};

export default class AccountVerifyEmail extends BaseEmail {
  verifyAccountInput: EmailVerifyLink;

  constructor(passwordEvent: EmailVerifyLink) {
    super();
    this.name = "SEND_ACCOUNT_VERIFY_EMAIL";
    this.verifyAccountInput = passwordEvent;
  }

  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    const emailSubjectKey = this.verifyAccountInput.isSecondaryEmailVerification
      ? "verify_email_email_header"
      : "verify_email_subject";
    return {
      to: `${this.verifyAccountInput.user.name} <${this.verifyAccountInput.user.email}>`,
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      subject: this.verifyAccountInput.language(emailSubjectKey, {
        appName: APP_NAME,
      }),
      html: await renderEmail("VerifyAccountEmail", this.verifyAccountInput),
      text: this.getTextBody(),
    };
  }

  protected getTextBody(): string {
    return `
${this.verifyAccountInput.language("verify_email_subject", { appName: APP_NAME })}
${this.verifyAccountInput.language("verify_email_email_header")}
${this.verifyAccountInput.language("hi_user_name", { name: this.verifyAccountInput.user.name })},
${this.verifyAccountInput.language("verify_email_email_body", { appName: APP_NAME })}
${this.verifyAccountInput.language("verify_email_email_link_text")}
${this.verifyAccountInput.verificationEmailLink}
${this.verifyAccountInput.language("happy_scheduling")} ${this.verifyAccountInput.language(
      "the_calcom_team",
      { companyName: COMPANY_NAME }
    )}
`.replace(/(<([^>]+)>)/gi, "");
  }
}
