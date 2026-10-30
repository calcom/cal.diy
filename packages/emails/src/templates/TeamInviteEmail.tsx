import ServerTrans from "@calcom/lib/components/ServerTrans";
import { APP_NAME, IS_PRODUCTION, WEBAPP_URL } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
import { getSubject, getTypeOfInvite } from "../../lib/utils/team-invite-utils";
import { CallToAction, V2BaseEmailHtml } from "../components";

type TeamInvite = {
  language: TFunction;
  from: string;
  to: string;
  teamName: string;
  joinLink: string;
  isCalcomMember: boolean;
  isAutoJoin: boolean;
  isOrg: boolean;
  parentTeamName: string | undefined;
  isExistingUserMovedToOrg: boolean;
  prevLink: string | null;
  newLink: string | null;
};

export const TeamInviteEmail = (
  props: TeamInvite & Partial<React.ComponentProps<typeof V2BaseEmailHtml>>
) => {
  const typeOfInvite = getTypeOfInvite(props);

  const heading = getHeading();
  const content = getContent();
  return (
    <V2BaseEmailHtml subject={getSubject(props)}>
      <p style={{ fontSize: "24px", marginBottom: "16px", textAlign: "center" }}>
        <>{heading}</>
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
        <>{content}</>
      </p>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <CallToAction
          label={props.language(
            props.isCalcomMember ? (props.isAutoJoin ? "login" : "accept_invite") : "join_now"
          )}
          href={props.joinLink}
          endIconName="linkIcon"
        />
      </div>
      <p
        style={{
          fontWeight: 400,
          lineHeight: "24px",
          marginBottom: "32px",
          marginTop: "48px",
          lineHeightStep: "24px",
        }}
      />

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

  function getHeading() {
    const autoJoinType = props.isAutoJoin ? "added" : "invited";
    const variables = {
      appName: APP_NAME,
      parentTeamName: props.parentTeamName,
    };

    if (typeOfInvite === "TO_ORG") {
      return props.language(`email_team_invite|heading|${autoJoinType}_to_org`, variables);
    }

    if (typeOfInvite === "TO_SUBTEAM") {
      return props.language(`email_team_invite|heading|${autoJoinType}_to_subteam`, variables);
    }

    return props.language(`email_team_invite|heading|invited_to_regular_team`, variables);
  }

  function getContent() {
    const autoJoinType = props.isAutoJoin ? "added" : "invited";

    const variables = {
      invitedBy: props.from.toString(),
      appName: APP_NAME,
      teamName: props.teamName,
      parentTeamName: props.parentTeamName,
      prevLink: props.prevLink,
      newLink: props.newLink,
      orgName: (props.parentTeamName ?? props.isOrg) ? props.teamName : "",
      prevLinkWithoutProtocol: props.prevLink?.replace(/https?:\/\//, ""),
      newLinkWithoutProtocol: props.newLink?.replace(/https?:\/\//, ""),
    };

    const {
      prevLink,
      newLink,
      teamName,
      invitedBy,
      appName,
      parentTeamName,
      prevLinkWithoutProtocol,
      newLinkWithoutProtocol,
    } = variables;
    if (typeOfInvite === "TO_ORG") {
      if (props.isExistingUserMovedToOrg) {
        return (
          <>
            {autoJoinType == "added" ? (
              <>
                <ServerTrans
                  t={props.language}
                  i18nKey="email_team_invite|content|added_to_org"
                  values={{ teamName, invitedBy, appName: APP_NAME }}
                />{" "}
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
                      <a
                        className="cursor-pointer text-blue-500 underline"
                        href={`${newLink}?orgRedirection=true`}>
                        {newLinkWithoutProtocol}
                      </a>
                    ),
                  }}
                  values={{ teamName, appName: APP_NAME }}
                />
              </>
            ) : (
              <>
                <ServerTrans
                  t={props.language}
                  i18nKey="email_team_invite|content|invited_to_org"
                  values={{ teamName, invitedBy, appName: APP_NAME }}
                />{" "}
                <ServerTrans
                  t={props.language}
                  i18nKey="existing_user_added_link_will_change"
                  values={{ teamName, appName: APP_NAME }}
                />
              </>
            )}
          </>
        );
      }
      return (
        <>
          {autoJoinType === "added" ? (
            <ServerTrans
              t={props.language}
              i18nKey="email_team_invite|content|added_to_org"
              values={{ teamName, invitedBy, appName: APP_NAME }}
            />
          ) : (
            <ServerTrans
              t={props.language}
              i18nKey="email_team_invite|content|invited_to_org"
              values={{ teamName, invitedBy, appName: APP_NAME }}
            />
          )}{" "}
          {appName} is the event-juggling scheduler that enables you and your team to schedule meetings
          without the email tennis.
        </>
      );
    }

    if (typeOfInvite === "TO_SUBTEAM") {
      return (
        <>
          {autoJoinType === "added" ? (
            <ServerTrans
              t={props.language}
              i18nKey="email_team_invite|content|added_to_subteam"
              values={{ teamName, parentTeamName: parentTeamName ?? "", invitedBy, appName: APP_NAME }}
            />
          ) : (
            <ServerTrans
              t={props.language}
              i18nKey="email_team_invite|content|invited_to_subteam"
              values={{ teamName, parentTeamName: parentTeamName ?? "", invitedBy, appName: APP_NAME }}
            />
          )}{" "}
          {appName} is the event-juggling scheduler that enables you and your team to schedule meetings
          without the email tennis.
        </>
      );
    }
    // Regular team doesn't support auto-join. So, they have to be invited always
    return props.language(`email_team_invite|content|invited_to_regular_team`, variables);
  }
};
