import { APP_NAME, COMPANY_NAME, SUPPORT_MAIL_ADDRESS } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
import { BaseEmailHtml } from "../components";

export type OrganizationEmailVerify = {
  language: TFunction;
  user: {
    email: string;
  };
  code: string;
};

export const OrganisationAccountVerifyEmail = (
  props: OrganizationEmailVerify & Partial<React.ComponentProps<typeof BaseEmailHtml>>
) => {
  return (
    <BaseEmailHtml subject={props.language("organization_verify_header", { appName: APP_NAME })}>
      <p
        style={{
          fontWeight: 600,
          fontSize: "32px",
          lineHeight: "38px",
        }}>
        <>{props.language("organization_verify_header")}</>
      </p>
      <p style={{ fontWeight: 400 }}>
        <>{props.language("hi_user_name", { name: props.user.email })}!</>
      </p>
      <p style={{ fontWeight: 400, lineHeight: "24px" }}>
        <>{props.language("organization_verify_email_body")}</>
      </p>

      <div style={{ display: "flex" }}>
        <div
          style={{
            borderRadius: "6px",
            backgroundColor: "#101010",
            padding: "6px 2px 6px 8px",
            flexShrink: 1,
          }}>
          <b style={{ fontWeight: 400, lineHeight: "24px", color: "white", letterSpacing: "6px" }}>
            {props.code}
          </b>
        </div>
      </div>

      <div style={{ lineHeight: "6px" }}>
        <p style={{ fontWeight: 400, lineHeight: "24px" }}>
          <>
            {props.language("happy_scheduling")} <br />
            <a
              href={`mailto:${SUPPORT_MAIL_ADDRESS}`}
              style={{ color: "#3E3E3E" }}
              target="_blank"
              rel="noreferrer">
              <>{props.language("the_calcom_team", { companyName: COMPANY_NAME })}</>
            </a>
          </>
        </p>
      </div>
    </BaseEmailHtml>
  );
};
