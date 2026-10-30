import type BaseEmail from "@calcom/emails/templates/_base-email";
import type { OAuthClientNotification } from "./templates/admin-oauth-client-notification";
import AdminOAuthClientNotification from "./templates/admin-oauth-client-notification";
import type { OAuthClientApprovedNotification } from "./templates/oauth-client-approved-notification";
import OAuthClientApprovedEmail from "./templates/oauth-client-approved-notification";
import type { OAuthClientRejectedNotification } from "./templates/oauth-client-rejected-notification";
import OAuthClientRejectedEmail from "./templates/oauth-client-rejected-notification";

const sendEmail = async (prepare: () => BaseEmail) => {
  let email: BaseEmail | undefined;

  try {
    email = prepare();
    return await email.sendEmail();
  } catch (e) {
    const errorName = e instanceof Error ? e.name : "UnknownError";
    console.error(
      `${email?.constructor?.name ?? "Email"}.sendEmail oauth-email-service failed (${errorName})`,
      e
    );
    throw e;
  }
};

export const sendAdminOAuthClientNotification = async (input: OAuthClientNotification) => {
  await sendEmail(() => new AdminOAuthClientNotification(input));
};

export const sendOAuthClientApprovedNotification = async (input: OAuthClientApprovedNotification) => {
  await sendEmail(() => new OAuthClientApprovedEmail(input));
};

export const sendOAuthClientRejectedNotification = async (input: OAuthClientRejectedNotification) => {
  await sendEmail(() => new OAuthClientRejectedEmail(input));
};
