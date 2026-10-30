import { APP_NAME, SUPPORT_MAIL_ADDRESS } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
import { BaseEmailHtml, CallToAction } from "../components";

export type PasswordReset = {
  language: TFunction;
  user: {
    name?: string | null;
    email: string;
  };
  resetLink: string;
};
export const ForgotPasswordEmail = (
  props: PasswordReset & Partial<React.ComponentProps<typeof BaseEmailHtml>>
) => {
  return (
    <BaseEmailHtml subject={props.language("reset_password_subject", { appName: APP_NAME })}>
      <p>
        <>{props.language("hi_user_name", { name: props.user.name })}!</>
      </p>
      <p style={{ fontWeight: 400, lineHeight: "24px" }}>
        <>{props.language("someone_requested_password_reset")}</>
      </p>
      <CallToAction label={props.language("change_password")} href={props.resetLink} />

      <div style={{ lineHeight: "6px" }}>
        <p style={{ fontWeight: 400, lineHeight: "24px" }}>
          <>{props.language("password_reset_instructions")}</>
        </p>
      </div>
      <div style={{ lineHeight: "6px" }}>
        <p style={{ fontWeight: 400, lineHeight: "24px" }}>
          <>
            {props.language("have_any_questions")}{" "}
            <a
              href={`mailto:${SUPPORT_MAIL_ADDRESS}`}
              style={{ color: "#3E3E3E" }}
              target="_blank"
              rel="noreferrer">
              <>{props.language("contact_our_support_team")}</>
            </a>
          </>
        </p>
      </div>
    </BaseEmailHtml>
  );
};
