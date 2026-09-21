import { EMAIL_FROM_NAME } from "@calcom/lib/constants";
import { getSubject, type TeamInvite } from "../lib/utils/team-invite-utils";
import renderEmail from "../src/renderEmail";
import BaseEmail from "./_base-email";

export { getSubject, getTypeOfInvite, type TeamInvite } from "../lib/utils/team-invite-utils";

export default class TeamInviteEmail extends BaseEmail {
  teamInviteEvent: TeamInvite;
  constructor(teamInviteEvent: TeamInvite) {
    super();
    this.name = "SEND_TEAM_INVITE_EMAIL";
    this.teamInviteEvent = teamInviteEvent;
  }

  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    return {
      to: this.teamInviteEvent.to,
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      subject: getSubject(this.teamInviteEvent),
      html: await renderEmail("TeamInviteEmail", this.teamInviteEvent),
      text: "",
    };
  }
}
