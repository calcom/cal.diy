import { EMAIL_FROM_NAME } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
import renderEmail from "../src/renderEmail";
import BaseEmail from "./_base-email";

export type OAuthClientRejectedNotification = {
  t: TFunction;
  userEmail: string;
  userName: string | null;
  clientName: string;
  clientId: string;
  rejectionReason: string;
};

export default class OAuthClientRejectedEmail extends BaseEmail {
  input: OAuthClientRejectedNotification;

  constructor(input: OAuthClientRejectedNotification) {
    super();
    this.name = "SEND_OAUTH_CLIENT_REJECTED_NOTIFICATION";
    this.input = input;
  }

  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    return {
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      to: this.input.userEmail,
      subject: `${this.input.t("oauth_client_rejected_email_subject", { clientName: this.input.clientName })}`,
      html: await renderEmail("OAuthClientRejectedNotificationEmail", {
        userName: this.input.userName,
        clientName: this.input.clientName,
        clientId: this.input.clientId,
        rejectionReason: this.input.rejectionReason,
        language: this.input.t,
      }),
      text: this.getTextBody(),
    };
  }

  protected getTextBody(): string {
    return `${this.input.t("oauth_client_rejected_email_title", { clientName: this.input.clientName })}
    ${this.input.t("oauth_client_rejected_email_body")}

    ${this.input.t("oauth_client_rejected_email_reason_label")}
    ${this.input.rejectionReason}`.trim();
  }
}
