import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";

import type { CalendarEvent, Person } from "@calcom/types/Calendar";

import NoShowFeeChargedEmail from "./no-show-fee-charged-email";

class TestNoShowFeeChargedEmail extends NoShowFeeChargedEmail {
  public async getPayload() {
    return await this.getNodeMailerPayload();
  }
}

// Echoes the interpolated amount so the assertion reads the exact number the
// template passed to i18next, rather than an Intl-formatted string.
const t = ((key: string, vars?: Record<string, unknown>) => {
  if (key === "no_show_fee_charged_email_subject") {
    return `No-show fee of ${String(vars?.amount ?? "")} charged`;
  }
  if (key === "no_show_fee_charged_subtitle") {
    return `Subtitle no-show fee of [${String(vars?.amount ?? "")}]`;
  }
  return key;
}) as unknown as TFunction;

const attendee: Person = {
  name: "Attendee",
  email: "attendee@example.com",
  timeZone: "UTC",
  language: { translate: t, locale: "en" },
};

const buildCalEvent = (amount: number, currency: string): CalendarEvent => ({
  type: "30min",
  title: "30 min meeting",
  startTime: "2026-09-10T10:00:00Z",
  endTime: "2026-09-10T10:30:00Z",
  organizer: {
    name: "Organizer",
    email: "organizer@example.com",
    timeZone: "UTC",
    language: { translate: t, locale: "en" },
  },
  attendees: [attendee],
  paymentInfo: { amount, currency, paymentOption: "HOLD" },
});

describe("NoShowFeeChargedEmail", () => {
  it("does not scale the amount for zero-decimal currencies", async () => {
    // JPY is stored unscaled, so 5000 means ¥5000 and must not be presented as ¥50.
    const payload = await new TestNoShowFeeChargedEmail(buildCalEvent(5000, "JPY"), attendee).getPayload();

    expect(payload.subject).toBe("No-show fee of 5000 charged");
    expect(String(payload.html)).toContain("Subtitle no-show fee of [5000]");
  });

  it("still scales the amount for two-decimal currencies", async () => {
    const payload = await new TestNoShowFeeChargedEmail(buildCalEvent(5000, "USD"), attendee).getPayload();

    expect(payload.subject).toBe("No-show fee of 50 charged");
    expect(String(payload.html)).toContain("Subtitle no-show fee of [50]");
  });
});
