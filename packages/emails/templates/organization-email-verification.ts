import { EMAIL_FROM_NAME } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
import renderEmail from "../src/renderEmail";
import BaseEmail from "./_base-email";

export type OrganizationEmailVerify = {
  language: TFunction;
  user: {
    email: string;
  };
  code: string;
};

export default class OrganizationEmailVerification extends BaseEmail {
  orgVerifyInput: OrganizationEmailVerify;

  constructor(orgVerifyInput: OrganizationEmailVerify) {
    super();
    this.name = "SEND_ORG_ACCOUNT_VERIFY_EMAIL";
    this.orgVerifyInput = orgVerifyInput;
  }

  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    return {
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      to: this.orgVerifyInput.user.email,
      subject: this.orgVerifyInput.language("verify_email_organization"),
      html: await renderEmail("OrganisationAccountVerifyEmail", this.orgVerifyInput),
      text: this.getTextBody(),
    };
  }

  protected getTextBody(): string {
    return `<b>Code:</b> ${this.orgVerifyInput.code}`;
  }
}
