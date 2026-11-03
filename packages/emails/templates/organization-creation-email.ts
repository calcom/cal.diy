import { EMAIL_FROM_NAME } from "@calcom/lib/constants";
import type { OrganizationCreation } from "../lib/types/email-types";
import renderEmail from "../src/renderEmail";
import BaseEmail from "./_base-email";

export type { OrganizationCreation } from "../lib/types/email-types";

export default class OrganizationCreationEmail extends BaseEmail {
  organizationCreationEvent: OrganizationCreation;

  constructor(organizationCreationEvent: OrganizationCreation) {
    super();
    this.name = "SEND_ORGANIZATION_CREATION_EMAIL";
    this.organizationCreationEvent = organizationCreationEvent;
  }

  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    return {
      to: this.organizationCreationEvent.to,
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      subject: this.organizationCreationEvent.language(`email_organization_created|subject`),
      html: await renderEmail("OrganizationCreationEmail", this.organizationCreationEvent),
      text: "",
    };
  }
}
