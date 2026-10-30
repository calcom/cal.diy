import { EMAIL_FROM_NAME, SUPPORT_MAIL_ADDRESS } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
import renderEmail from "../src/renderEmail";
import BaseEmail from "./_base-email";

export type OAuthClientNotification = {
  t: TFunction;
  clientName: string;
  purpose: string | null;
  clientId: string;
  redirectUri: string;
  submitterEmail: string;
  submitterName: string | null;
};

export default class AdminOAuthClientNotification extends BaseEmail {
  input: OAuthClientNotification;

  constructor(input: OAuthClientNotification) {
    super();
    this.name = "SEND_ADMIN_OAUTH_CLIENT_NOTIFICATION";
    this.input = input;
  }

  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    return {
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      to: SUPPORT_MAIL_ADDRESS,
      subject: `${this.input.t("admin_oauth_notification_email_subject", { clientName: this.input.clientName })}`,
      html: await renderEmail("AdminOAuthClientNotificationEmail", {
        clientName: this.input.clientName,
        purpose: this.input.purpose,
        clientId: this.input.clientId,
        redirectUri: this.input.redirectUri,
        submitterEmail: this.input.submitterEmail,
        submitterName: this.input.submitterName,
        language: this.input.t,
      }),
      text: this.getTextBody(),
    };
  }

  protected getTextBody(): string {
    return `${this.input.t("hi_admin")}, ${this.input.t("admin_oauth_notification_email_title", { clientName: this.input.clientName })}
    ${this.input.t("admin_oauth_notification_email_body", { submitterEmail: this.input.submitterEmail })}
    ${this.input.t("purpose")}: ${this.input.purpose ?? ""}`.trim();
  }
}
