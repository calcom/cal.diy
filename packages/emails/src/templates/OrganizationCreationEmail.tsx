import ServerTrans from "@calcom/lib/components/ServerTrans";
import { APP_NAME, WEBAPP_URL } from "@calcom/lib/constants";
import type { OrganizationCreation } from "../../lib/types/email-types";
import { V2BaseEmailHtml } from "../components";

export const OrganizationCreationEmail = (
  props: OrganizationCreation & Partial<React.ComponentProps<typeof V2BaseEmailHtml>>
) => {
  const { prevLink, newLink, orgName: teamName } = props;
  const prevLinkWithoutProtocol = props.prevLink?.replace(/https?:\/\//, "");
  const newLinkWithoutProtocol = props.newLink?.replace(/https?:\/\//, "");
  const isNewUser = props.ownerOldUsername === null;
  return (
    <V2BaseEmailHtml subject={props.language(`email_organization_created|subject`)}>
      <p style={{ fontSize: "24px", marginBottom: "16px", textAlign: "center" }}>
        <>{props.language(`You have created ${props.orgName} organization.`)}</>
      </p>
      <img
        style={{
          borderRadius: "16px",
          height: "270px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        src={`${WEBAPP_URL}/emails/calendar-email-hero.png`}
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
        You have been added as an owner of the organization.
      </p>
      <p
        data-testid="organization-link-info"
        style={{
          fontWeight: 400,
          lineHeight: "24px",
          marginBottom: "32px",
          marginTop: "48px",
          lineHeightStep: "24px",
        }}>
        {isNewUser ? (
          <>
            Enjoy your new organization link: <a href={`${newLink}`}>{newLinkWithoutProtocol}</a>
          </>
        ) : (
          <ServerTrans
            t={props.language}
            i18nKey="email|existing_user_added_link_changed"
            components={{
              a0: (
                <a className="cursor-pointer text-blue-500 underline" href={prevLink ?? ""}>
                  {prevLinkWithoutProtocol}
                </a>
              ),
              a1: (
                <a className="cursor-pointer text-blue-500 underline" href={newLink ?? ""}>
                  {newLinkWithoutProtocol}
                </a>
              ),
              a2: (
                <a className="cursor-pointer text-blue-500 underline" href={`${newLink}?orgRedirection=true`}>
                  {newLinkWithoutProtocol}
                </a>
              ),
            }}
            values={{ teamName }}
          />
        )}
      </p>

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
