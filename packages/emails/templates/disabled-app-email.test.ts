import { describe, expect, it } from "vitest";

import type { TFunction } from "i18next";

import DisabledAppEmail from "./disabled-app-email";

class TestDisabledAppEmail extends DisabledAppEmail {
  public async getPayload() {
    return await this.getNodeMailerPayload();
  }
}

const t = ((key: string, vars?: Record<string, unknown>) => {
  const appName = String(vars?.appName ?? "");
  if (key === "app_disabled_subject") return `${appName} has been disabled`;
  if (key === "admin_has_disabled") return `An admin has disabled ${appName}`;
  if (key === "app_disabled_with_event_type") {
    return `The admin has disabled ${appName} which affects your event type ${String(vars?.title ?? "")}.`;
  }
  return key;
}) as unknown as TFunction;

describe("DisabledAppEmail", () => {
  it("renders the event type message when an app used by an event type is disabled", async () => {
    const email = new TestDisabledAppEmail("user@example.com", "Fathom", ["analytics"], t, "Intro call", 42);
    const payload = await email.getPayload();

    const html = "html" in payload ? (payload.html as string) : "";

    expect(html).toContain("Fathom has been disabled");
    expect(html).toContain("The admin has disabled Fathom which affects your event type Intro call.");
    expect(html).toContain("/event-types/42?tabName=apps");
    expect(payload.text).toBe("The admin has disabled Fathom which affects your event type Intro call.");
  });

  it("uses an existing translation key for the plain-text body", async () => {
    const email = new TestDisabledAppEmail("user@example.com", "Fathom", ["analytics"], t);
    const payload = await email.getPayload();

    expect(payload.subject).toBe("An admin has disabled Fathom");
    expect(payload.text).toBe("An admin has disabled Fathom");
  });
});
