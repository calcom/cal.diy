import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import OAuthClientApprovedEmail from "./oauth-client-approved-notification";

class TestOAuthClientApprovedEmail extends OAuthClientApprovedEmail {
  public async getPayload() {
    return await this.getNodeMailerPayload();
  }
}

describe("OAuthClientApprovedEmail", () => {
  it("renders a node mailer payload containing the approved client information", async () => {
    const t = ((key: string, vars?: Record<string, unknown>) => {
      if (key === "oauth_client_approved_email_subject") {
        return `OAuth Client Approved: ${String(vars?.clientName ?? "")}`;
      }

      if (key === "oauth_client_approved_email_title") {
        return `OAuth Client Approved: ${String(vars?.clientName ?? "")}`;
      }

      if (key === "hi_user") return `Hi ${String(vars?.name ?? "")}`;
      if (key === "there") return "there";

      if (key === "oauth_client_approved_email_body") {
        return "Great news! Your OAuth client has been approved and is now ready to use.";
      }

      if (key === "oauth_client_approved_email_footer") {
        return "You can now use your client ID and secret to integrate with Cal.diy.";
      }

      if (key === "oauth_client_approved_email_cta") return "View Your OAuth Clients";

      if (key === "client_name") return "Name";
      if (key === "client_id") return "Client ID";

      return key;
    }) as unknown as TFunction;

    const input = {
      t,
      userEmail: "admin@example.com",
      userName: "Admin Example",
      clientName: "pkce",
      clientId: "client_123",
    };

    const email = new TestOAuthClientApprovedEmail(input);
    const payload = await email.getPayload();

    expect(payload).toEqual(
      expect.objectContaining({
        to: input.userEmail,
        subject: `OAuth Client Approved: ${input.clientName}`,
      })
    );

    const html = "html" in payload ? (payload.html as string) : "";

    expect(html).toContain(`OAuth Client Approved: ${input.clientName}`);
    expect(html).toContain("Hi Admin Example!");
    expect(html).toContain("Great news! Your OAuth client has been approved and is now ready to use.");

    expect(html).toContain(">Name<");
    expect(html).toContain(input.clientName);

    expect(html).toContain(">Client ID<");
    expect(html).toContain(input.clientId);

    expect(html).toContain("View Your OAuth Clients");
    expect(html).toContain("/settings/developer/oauth");

    expect(html).toContain("You can now use your client ID and secret to integrate with Cal.diy.");
  });
});
