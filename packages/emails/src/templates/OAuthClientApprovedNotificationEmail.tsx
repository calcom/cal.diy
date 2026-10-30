import { APP_NAME, WEBAPP_URL } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
import { BaseEmailHtml, CallToAction } from "../components";

type OAuthClientApprovedNotification = {
  language: TFunction;
  userName: string | null;
  clientName: string;
  clientId: string;
};

export const OAuthClientApprovedNotificationEmail = ({
  userName,
  clientName,
  clientId,
  language,
}: OAuthClientApprovedNotification) => {
  return (
    <BaseEmailHtml
      subject={language("oauth_client_approved_email_subject", { clientName, appName: APP_NAME })}
      callToAction={
        <CallToAction
          label={language("oauth_client_approved_email_cta")}
          href={`${WEBAPP_URL}/settings/developer/oauth`}
          endIconName="white-arrow-right"
        />
      }>
      <p
        style={{
          fontWeight: 600,
          fontSize: "24px",
          lineHeight: "38px",
        }}>
        {language("oauth_client_approved_email_title", { clientName })}
      </p>
      <p style={{ fontWeight: 400 }}>{language("hi_user", { name: userName || language("there") })}!</p>
      <p style={{ fontWeight: 400, lineHeight: "24px" }}>{language("oauth_client_approved_email_body")}</p>
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
                fontWeight: 600,
              }}>
              {language("client_id")}
            </td>
            <td style={{ padding: "12px" }}>
              <code style={{ fontSize: "12px" }}>{clientId}</code>
            </td>
          </tr>
        </tbody>
      </table>
      <p style={{ fontWeight: 400, lineHeight: "24px", marginTop: "20px" }}>
        {language("oauth_client_approved_email_footer")}
      </p>
    </BaseEmailHtml>
  );
};
