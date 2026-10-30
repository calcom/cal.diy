import { APP_NAME, SENDER_NAME, SUPPORT_MAIL_ADDRESS } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
import { BaseEmailHtml, CallToAction } from "../components";

export type EmailVerifyLink = {
  language: TFunction;
  user: {
    name?: string | null;
    emailFrom: string;
    emailTo: string;
  };
  verificationEmailLink: string;
};

export const VerifyEmailChangeEmail = (
  props: EmailVerifyLink & Partial<React.ComponentProps<typeof BaseEmailHtml>>
) => {
  return (
    <BaseEmailHtml subject={props.language("change_of_email", { appName: APP_NAME })}>
      <p
        style={{
          fontWeight: 600,
          fontSize: "24px",
          lineHeight: "32px",
        }}>
        <>{props.language("change_of_email", { appName: APP_NAME })}</>
      </p>
      <p style={{ fontWeight: 400 }}>
        <>{props.language("hi_user_name", { name: props.user.name })}!</>
      </p>
      <p style={{ fontWeight: 400, lineHeight: "24px" }}>
        <>{props.language("verify_email_change_description", { appName: APP_NAME })}</>
      </p>
      <div
        style={{
          marginTop: "2rem",
          marginBottom: "2rem",
          display: "flex",
          justifyContent: "space-between",
        }}>
        <div
          style={{
            width: "100%",
          }}>
          <span
            style={{
              display: "block",
              fontSize: "14px",
              lineHeight: 0.5,
            }}>
            {props.language("old_email_address")}
          </span>
          <p
            style={{
              color: `#6B7280`,
              lineHeight: 1,
              fontWeight: 400,
            }}>
            {props.user.emailFrom}
          </p>
        </div>
        <div
          style={{
            width: "100%",
          }}>
          <span
            style={{
              display: "block",
              fontSize: "14px",
              lineHeight: 0.5,
            }}>
            {props.language("new_email_address")}
          </span>
          <p
            style={{
              color: `#6B7280`,
              lineHeight: 1,
              fontWeight: 400,
            }}>
            {props.user.emailTo}
          </p>
        </div>
      </div>
      <CallToAction label={props.language("verify_email_button")} href={props.verificationEmailLink} />
      <div style={{ lineHeight: "6px" }}>
        <p style={{ fontWeight: 400, lineHeight: "24px" }}>
          <>
            {props.language("happy_scheduling")}, <br />
            <a
              href={`mailto:${SUPPORT_MAIL_ADDRESS}`}
              style={{ color: "#3E3E3E" }}
              target="_blank"
              rel="noreferrer">
              <>{props.language("the_calcom_team", { companyName: SENDER_NAME })}</>
            </a>
          </>
        </p>
      </div>
    </BaseEmailHtml>
  );
};
