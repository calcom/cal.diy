import type { TFunction } from "i18next";

import { APP_NAME, EMAIL_FROM_NAME } from "@calcom/lib/constants";

import renderEmail from "../src/renderEmail";
import BaseEmail from "./_base-email";

export type PasswordReset = {
  language: TFunction;
  user: {
    name?: string | null;
    email: string;
  };
  resetLink: string;
};

export default class ForgotPasswordEmail extends BaseEmail {
  passwordEvent: PasswordReset;

  constructor(passwordEvent: PasswordReset) {
    super();
    this.name = "SEND_PASSWORD_RESET_EMAIL";
    this.passwordEvent = passwordEvent;
  }

  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    return {
      to: `${this.passwordEvent.user.name} <${this.passwordEvent.user.email}>`,
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      subject: this.passwordEvent.language("reset_password_subject", {
        appName: APP_NAME,
      }),
      html: await renderEmail("ForgotPasswordEmail", this.passwordEvent),
      text: this.getTextBody(),
    };
  }

  protected getTextBody(): string {
    // Tags are stripped from the translated text only, so angle brackets in the user's name are kept.
    const text = (key: string, options?: Record<string, string>) =>
      this.passwordEvent.language(key, options).replace(/(<([^>]+)>)/gi, "");

    return `
${text("reset_password_subject", { appName: APP_NAME })}
${this.passwordEvent.language("hi_user_name", { name: this.passwordEvent.user.name })},
${text("someone_requested_password_reset")}
${text("change_password")}: ${this.passwordEvent.resetLink}
${text("password_reset_instructions")}
${text("have_any_questions")} ${text("contact_our_support_team")}
`;
  }
}
