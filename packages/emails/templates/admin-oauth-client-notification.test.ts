import { SUPPORT_MAIL_ADDRESS } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import AdminOAuthClientNotification from "./admin-oauth-client-notification";

class TestAdminOAuthClientNotification extends AdminOAuthClientNotification {
  public async getPayload() {
    return await this.getNodeMailerPayload();
  }
}

describe("AdminOAuthClientNotification", () => {
  it("renders a node mailer payload containing the submitted client information", async () => {
    const t = ((key: string, vars?: Record<string, unknown>) => {
      if (key === "admin_oauth_notification_email_subject") {
        return `New OAuth Client: ${String(vars?.clientName ?? "")}`;
      }

      if (key === "admin_oauth_notification_email_title") {
        return `New OAuth Client: ${String(vars?.clientName ?? "")}`;
      }

      if (key === "hi_admin") return "Hi Administrator";

      if (key === "admin_oauth_notification_email_body") {
        return `A new OAuth client has been submitted by ${String(vars?.submitterEmail ?? "")} and is awaiting your review.`;
      }

      if (key === "admin_oauth_notification_email_cta") return "Review OAuth Clients";
      if (key === "admin_oauth_notification_email_footer") {
        return "Please review this submission and approve or reject it in the admin dashboard.";
      }

      if (key === "client_name") return "Name";
      if (key === "purpose") return "Purpose";
      if (key === "client_id") return "Client ID";
      if (key === "redirect_uri") return "Redirect URI";
      if (key === "submitted_by") return "Submitted By";

      return key;
    }) as unknown as TFunction;

    const input = {
      t,
      clientName: "My Client",
      purpose: "My Purpose",
      clientId: "client_123",
      redirectUri: "https://example.com/callback",
      submitterEmail: "submitter@example.com",
      submitterName: "Submitter Name",
    };

    const email = new TestAdminOAuthClientNotification(input);
    const payload = await email.getPayload();

    expect(payload).toEqual(
      expect.objectContaining({
        to: SUPPORT_MAIL_ADDRESS,
        subject: `New OAuth Client: ${input.clientName}`,
      })
    );

    const html = "html" in payload ? (payload.html as string) : "";
    expect(html).toContain(`New OAuth Client: ${input.clientName}`);
    expect(html).toContain("Hi Administrator");
    expect(html).toContain(
      `A new OAuth client has been submitted by ${input.submitterEmail} and is awaiting your review.`
    );
    expect(html).toContain("Review OAuth Clients");
    expect(html).toContain("Please review this submission and approve or reject it in the admin dashboard.");

    expect(html).toContain(">Name<");
    expect(html).toContain(input.clientName);

    expect(html).toContain(">Purpose<");
    expect(html).toContain(input.purpose);

    expect(html).toContain(">Client ID<");
    expect(html).toContain(input.clientId);

    expect(html).toContain(">Redirect URI<");
    expect(html).toContain(input.redirectUri);

    expect(html).toContain(">Submitted By<");
    expect(html).toContain(`${input.submitterName} (${input.submitterEmail})`);
  });
});
