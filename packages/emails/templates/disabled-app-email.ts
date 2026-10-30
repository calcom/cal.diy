import { EMAIL_FROM_NAME } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
import renderEmail from "../src/renderEmail";
import BaseEmail from "./_base-email";

export default class DisabledAppEmail extends BaseEmail {
  email: string;
  appName: string;
  appType: string[];
  t: TFunction;
  title?: string;
  eventTypeId?: number;

  constructor(
    email: string,
    appName: string,
    appType: string[],
    t: TFunction,
    title?: string,
    eventTypeId?: number
  ) {
    super();
    this.email = email;
    this.appName = appName;
    this.appType = appType;
    this.t = t;
    this.title = title;
    this.eventTypeId = eventTypeId;
  }

  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    return {
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      to: this.email,
      subject:
        this.title && this.eventTypeId
          ? this.t("disabled_app_affects_event_type", { appName: this.appName, eventType: this.title })
          : this.t("admin_has_disabled", { appName: this.appName }),
      html: await renderEmail("DisabledAppEmail", {
        title: this.title,
        appName: this.appName,
        eventTypeId: this.eventTypeId,
        appType: this.appType,
        t: this.t,
      }),
      text: this.getTextBody(),
    };
  }

  protected getTextBody(): string {
    return this.appType.some((type) => type === "payment")
      ? this.t("disable_payment_app", { appName: this.appName, title: this.title })
      : this.appType.some((type) => type === "video")
        ? this.t("app_disabled_video", { appName: this.appName })
        : this.t("app_disabled", { appName: this.appName });
  }
}
