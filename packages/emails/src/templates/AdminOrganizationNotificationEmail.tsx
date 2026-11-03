import ServerTrans from "@calcom/lib/components/ServerTrans";
import { APP_NAME, WEBAPP_URL } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
import { BaseEmailHtml, CallToAction } from "../components";

type AdminOrganizationNotification = {
  language: TFunction;
  orgSlug: string;
  webappIPAddress: string;
};

const dnsTable = (type: string, name: string, value: string, t: TFunction) => (
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
      border: "solid black 1px",
    }}
    width="100%">
    <tbody>
      <thead>
        <tr
          style={{
            backgroundColor: "black",
            color: "white",
            fontSize: "14px",
            lineHeight: "24px",
          }}>
          <td
            align="center"
            width="33%"
            style={{ borderTopLeftRadius: "5px", borderRight: "1px solid white" }}>
            {t("type")}
          </td>
          <td align="center" width="33%" style={{ borderRight: "1px solid white" }}>
            {t("name")}
          </td>
          <td align="center" style={{ borderTopRightRadius: "5px" }}>
            {t("value")}
          </td>
        </tr>
      </thead>
      <tr style={{ lineHeight: "24px" }}>
        <td align="center" style={{ borderBottomLeftRadius: "5px", borderRight: "1px solid black" }}>
          {type}
        </td>
        <td align="center" style={{ borderRight: "1px solid black" }}>
          {name}
        </td>
        <td align="center" style={{ borderBottomRightRadius: "5px" }}>
          {value}
        </td>
      </tr>
    </tbody>
  </table>
);

export const AdminOrganizationNotificationEmail = ({
  orgSlug,
  webappIPAddress,
  language,
}: AdminOrganizationNotification) => {
  const webAppUrl = WEBAPP_URL.replace("https://", "")?.replace("http://", "").replace(/(:.*)/, "");
  return (
    <BaseEmailHtml
      subject={language("admin_org_notification_email_subject", { appName: APP_NAME })}
      callToAction={
        <CallToAction
          label={language("admin_org_notification_email_cta")}
          href={`${WEBAPP_URL}/settings/admin/organizations`}
          endIconName="white-arrow-right"
        />
      }>
      <p
        style={{
          fontWeight: 600,
          fontSize: "24px",
          lineHeight: "38px",
        }}>
        <>{language("admin_org_notification_email_title")}</>
      </p>
      <p style={{ fontWeight: 400 }}>
        <>{language("hi_admin")}!</>
      </p>
      <p style={{ fontWeight: 400, lineHeight: "24px" }}>
        <ServerTrans i18nKey="admin_org_notification_email_body_part1" t={language} values={{ orgSlug }} />
      </p>
      {dnsTable("A", orgSlug, webappIPAddress, language)}
      <p style={{ fontWeight: 400, lineHeight: "24px" }}>
        {language("admin_org_notification_email_body_part2")}
      </p>
      {dnsTable("CNAME", orgSlug, webAppUrl, language)}
      <p style={{ fontWeight: 400, lineHeight: "24px" }}>
        {language("admin_org_notification_email_body_part3")}
      </p>
    </BaseEmailHtml>
  );
};
