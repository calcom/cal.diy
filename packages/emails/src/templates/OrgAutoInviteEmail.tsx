import { APP_NAME, IS_PRODUCTION, WEBAPP_URL } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
import { CallToAction, V2BaseEmailHtml } from "../components";

type TeamInvite = {
  language: TFunction;
  from: string;
  to: string;
  orgName: string;
  joinLink: string;
};

export const OrgAutoInviteEmail = (
  props: TeamInvite & Partial<React.ComponentProps<typeof V2BaseEmailHtml>>
) => {
  return (
    <V2BaseEmailHtml
      subject={props.language("user_invited_you", {
        user: props.from,
        team: props.orgName,
        appName: APP_NAME,
        entity: "organization",
      })}>
      <p style={{ fontSize: "24px", marginBottom: "16px", textAlign: "center" }}>
        <>
          {props.language("organization_admin_invited_heading", {
            orgName: props.orgName,
          })}
        </>
      </p>
      <img
        style={{
          borderRadius: "16px",
          height: "270px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        src={
          IS_PRODUCTION
            ? `${WEBAPP_URL}/emails/calendar-email-hero.png`
            : "http://localhost:3000/emails/calendar-email-hero.png"
        }
        alt=""
      />
      <p
        style={{
          fontWeight: 400,
          lineHeight: "24px",
          marginBottom: "32px",
          marginTop: "32px",
          lineHeightStep: "24px",
        }}>
        <>
          {props.language("organization_admin_invited_body", {
            orgName: props.orgName,
          })}
        </>
      </p>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <CallToAction
          label={props.language("email_user_cta", {
            entity: "organization",
          })}
          href={props.joinLink}
          endIconName="linkIcon"
        />
      </div>

      <div className="">
        <p
          style={{
            fontWeight: 400,
            lineHeight: "24px",
            marginBottom: "32px",
            marginTop: "32px",
            lineHeightStep: "24px",
          }}>
          <>
            {props.language("email_no_user_signoff", {
              appName: APP_NAME,
              entity: props.language("organization").toLowerCase(),
            })}
          </>
        </p>
      </div>

      <div style={{ borderTop: "1px solid #E1E1E1", marginTop: "32px", paddingTop: "32px" }}>
        <p style={{ fontWeight: 400, margin: 0 }}>
          <>
            {props.language("have_any_questions")}{" "}
            <a href="mailto:support@cal.com" style={{ color: "#3E3E3E" }} target="_blank" rel="noreferrer">
              <>{props.language("contact")}</>
            </a>{" "}
            {props.language("our_support_team")}
          </>
        </p>
      </div>
    </V2BaseEmailHtml>
  );
};
