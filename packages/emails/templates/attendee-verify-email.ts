import { APP_NAME, COMPANY_NAME, EMAIL_FROM_NAME } from "@calcom/lib/constants";

import type { EmailVerifyCode } from "../lib/types/email-types";
import renderEmail from "../src/renderEmail";
import BaseEmail from "./_base-email";

export type { EmailVerifyCode } from "../lib/types/email-types";

export default class AttendeeVerifyEmail extends BaseEmail {
  verifyAccountInput: EmailVerifyCode;

  constructor(passwordEvent: EmailVerifyCode) {
    super();
    this.name = "SEND_ACCOUNT_VERIFY_EMAIL";
    this.verifyAccountInput = passwordEvent;
  }

  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    return {
      to: `${this.verifyAccountInput.user.name} <${this.verifyAccountInput.user.email}>`,
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      subject: this.verifyAccountInput.hideLogo
        ? this.verifyAccountInput.language("verify_email_subject_no_branding")
        : this.verifyAccountInput.language(
            `verify_email_subject${this.verifyAccountInput.isVerifyingEmail ? "_verifying_email" : ""}`,
            { appName: APP_NAME }
          ),
      html: await renderEmail("VerifyEmailByCode", this.verifyAccountInput),
      text: this.getTextBody(),
    };
  }

  protected getTextBody(): string {
    // Tags are stripped from the translated text only, so angle brackets in the user's name are kept.
    const text = (key: string, options?: Record<string, string>) =>
      this.verifyAccountInput.language(key, options).replace(/(<([^>]+)>)/gi, "");

    const subject = this.verifyAccountInput.hideLogo
      ? text("verify_email_subject_no_branding")
      : text(`verify_email_subject${this.verifyAccountInput.isVerifyingEmail ? "_verifying_email" : ""}`, {
          appName: APP_NAME,
        });

    const footer = this.verifyAccountInput.hideLogo
      ? ""
      : `${text("happy_scheduling")} ${text("the_calcom_team", { companyName: COMPANY_NAME })}`;

    return `
${subject}
${text("verify_email_email_header")}
${this.verifyAccountInput.language("hi_user_name", { name: this.verifyAccountInput.user.name })},
${text("verify_email_by_code_email_body")}
${this.verifyAccountInput.verificationEmailCode}
${footer}
`;
  }
}
