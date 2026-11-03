import { APP_NAME, SENDER_NAME, SUPPORT_MAIL_ADDRESS } from "@calcom/lib/constants";
import type { EmailVerifyCode } from "../../lib/types/email-types";
import { BaseEmailHtml } from "../components";

export const VerifyEmailByCode = (
  props: EmailVerifyCode & Partial<React.ComponentProps<typeof BaseEmailHtml>>
) => {
  return (
    <BaseEmailHtml
      hideLogo={props.hideLogo}
      subject={
        props.hideLogo
          ? props.language("verify_email_subject_no_branding")
          : props.language(`verify_email_subject${props.isVerifyingEmail ? "_verifying_email" : ""}`, {
              appName: APP_NAME,
            })
      }>
      <p
        style={{
          fontWeight: 600,
          fontSize: "32px",
          lineHeight: "38px",
        }}>
        <>{props.language("verify_email_email_header")}</>
      </p>
      <p style={{ fontWeight: 400 }}>
        <>{props.language("hi_user_name", { name: props.user.name })}!</>
      </p>
      <div style={{ lineHeight: "6px" }}>
        <p style={{ fontWeight: 400, lineHeight: "24px" }}>
          <>
            {props.language("verify_email_by_code_email_body")}
            <br />
            <span>{props.verificationEmailCode}</span>
          </>
        </p>
      </div>
      {!props.hideLogo && (
        <div style={{ lineHeight: "6px" }}>
          <p style={{ fontWeight: 400, lineHeight: "24px" }}>
            <>
              {props.language("happy_scheduling")}, <br />
              <a
                href={`mailto:${SUPPORT_MAIL_ADDRESS}`}
                style={{ color: "#3E3E3E" }}
                target="_blank"
                rel="noreferrer">
                <>
                  {props.language("the_calcom_team", {
                    companyName: SENDER_NAME,
                  })}
                </>
              </a>
            </>
          </p>
        </div>
      )}
    </BaseEmailHtml>
  );
};
