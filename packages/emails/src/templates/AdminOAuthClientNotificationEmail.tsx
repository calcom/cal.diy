import { APP_NAME, WEBAPP_URL } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
import { BaseEmailHtml, CallToAction } from "../components";

type AdminOAuthClientNotification = {
  language: TFunction;
  clientName: string;
  purpose: string | null;
  clientId: string;
  redirectUri: string;
  submitterEmail: string;
  submitterName: string | null;
};

export const AdminOAuthClientNotificationEmail = ({
  clientName,
  purpose,
  clientId,
  redirectUri,
  submitterEmail,
  submitterName,
  language,
}: AdminOAuthClientNotification) => {
  return (
    <BaseEmailHtml
      subject={language("admin_oauth_notification_email_subject", { clientName, appName: APP_NAME })}
      callToAction={
        <CallToAction
          label={language("admin_oauth_notification_email_cta")}
          href={`${WEBAPP_URL}/settings/admin/oauth`}
          endIconName="white-arrow-right"
        />
      }>
      <p
        style={{
          fontWeight: 600,
          fontSize: "24px",
          lineHeight: "38px",
        }}>
        <>{language("admin_oauth_notification_email_title", { clientName })}</>
      </p>
      <p style={{ fontWeight: 400 }}>
        <>{language("hi_admin")}</>
      </p>
      <p style={{ fontWeight: 400, lineHeight: "24px" }}>
        {language("admin_oauth_notification_email_body", { submitterEmail })}
      </p>
      <table
        role="presentation"
        border={0}
        cellSpacing="0"
        cellPadding="0"
        style={{
          verticalAlign: "top",
          marginTop: "10px",
          borderRadius: "6px",
          borderCollapse: "separate",
          border: "solid #e5e7eb 1px",
        }}
        width="100%">
        <tbody>
          <tr style={{ lineHeight: "24px" }}>
            <td
              style={{
                padding: "12px",
                borderBottom: "1px solid #e5e7eb",
                fontWeight: 600,
                width: "30%",
              }}>
              {language("client_name")}
            </td>
            <td style={{ padding: "12px", borderBottom: "1px solid #e5e7eb" }}>{clientName}</td>
          </tr>
          <tr style={{ lineHeight: "24px" }}>
            <td
              style={{
                padding: "12px",
                borderBottom: "1px solid #e5e7eb",
                fontWeight: 600,
              }}>
              {language("purpose")}
            </td>
            <td style={{ padding: "12px", borderBottom: "1px solid #e5e7eb" }}>{purpose ?? ""}</td>
          </tr>
          <tr style={{ lineHeight: "24px" }}>
            <td
              style={{
                padding: "12px",
                borderBottom: "1px solid #e5e7eb",
                fontWeight: 600,
              }}>
              {language("client_id")}
            </td>
            <td style={{ padding: "12px", borderBottom: "1px solid #e5e7eb" }}>
              <code style={{ fontSize: "12px" }}>{clientId}</code>
            </td>
          </tr>
          <tr style={{ lineHeight: "24px" }}>
            <td
              style={{
                padding: "12px",
                borderBottom: "1px solid #e5e7eb",
                fontWeight: 600,
              }}>
              {language("redirect_uri")}
            </td>
            <td style={{ padding: "12px", borderBottom: "1px solid #e5e7eb" }}>{redirectUri}</td>
          </tr>
          <tr style={{ lineHeight: "24px" }}>
            <td style={{ padding: "12px", fontWeight: 600 }}>{language("submitted_by")}</td>
            <td style={{ padding: "12px" }}>
              {submitterName ? `${submitterName} (${submitterEmail})` : submitterEmail}
            </td>
          </tr>
        </tbody>
      </table>
      <p style={{ fontWeight: 400, lineHeight: "24px", marginTop: "20px" }}>
        {language("admin_oauth_notification_email_footer")}
      </p>
    </BaseEmailHtml>
  );
};
