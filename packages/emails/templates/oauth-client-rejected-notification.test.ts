import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import OAuthClientRejectedEmail from "./oauth-client-rejected-notification";

class TestOAuthClientRejectedEmail extends OAuthClientRejectedEmail {
  public async getPayload() {
    return await this.getNodeMailerPayload();
  }
}

describe("OAuthClientRejectedEmail", () => {
  it("renders a node mailer payload containing the rejected client information and rejection reason", async () => {
    const t = ((key: string, vars?: Record<string, unknown>) => {
      if (key === "oauth_client_rejected_email_subject") {
        return `OAuth Client Rejected: ${String(vars?.clientName ?? "")}`;
      }

      if (key === "oauth_client_rejected_email_title") {
        return `OAuth Client Rejected: ${String(vars?.clientName ?? "")}`;
      }

      if (key === "hi_user") return `Hi ${String(vars?.name ?? "")}`;
      if (key === "there") return "there";

      if (key === "oauth_client_rejected_email_body") {
        return "Unfortunately, your OAuth client submission was rejected.";
      }

      if (key === "oauth_client_rejected_email_reason_label") return "Reason for rejection";

      if (key === "oauth_client_rejected_email_footer") {
        return "You can update your OAuth client submission and resubmit it for review.";
      }

      if (key === "oauth_client_rejected_email_cta") return "View Your OAuth Clients";

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
      rejectionReason: "we dont support your usecase",
    };

    const email = new TestOAuthClientRejectedEmail(input);
    const payload = await email.getPayload();

    expect(payload).toEqual(
      expect.objectContaining({
        to: input.userEmail,
        subject: `OAuth Client Rejected: ${input.clientName}`,
      })
    );

    const html = "html" in payload ? (payload.html as string) : "";

    expect(html).toContain(`OAuth Client Rejected: ${input.clientName}`);
    expect(html).toContain("Hi Admin Example!");
    expect(html).toContain("Unfortunately, your OAuth client submission was rejected.");

    expect(html).toContain(">Name<");
    expect(html).toContain(input.clientName);

    expect(html).toContain(">Client ID<");
    expect(html).toContain(input.clientId);

    expect(html).toContain("Reason for rejection");
    expect(html).toContain(input.rejectionReason);

    expect(html).toContain("View Your OAuth Clients");
    expect(html).toContain("/settings/developer/oauth");

    expect(html).toContain("You can update your OAuth client submission and resubmit it for review.");
  });
});
