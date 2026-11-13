import { APP_NAME, EMAIL_FROM_NAME } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
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
    return `
${this.passwordEvent.language("reset_password_subject", { appName: APP_NAME })}
${this.passwordEvent.language("hi_user_name", { name: this.passwordEvent.user.name })},
${this.passwordEvent.language("someone_requested_password_reset")}
${this.passwordEvent.language("change_password")}: ${this.passwordEvent.resetLink}
${this.passwordEvent.language("password_reset_instructions")}
${this.passwordEvent.language("have_any_questions")} ${this.passwordEvent.language(
      "contact_our_support_team"
    )}
`.replace(/(<([^>]+)>)/gi, "");
  }
}
