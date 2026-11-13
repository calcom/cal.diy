import { buildCalendarEvent, buildPerson } from "@calcom/lib/test/builder";
import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import AccountVerifyEmail from "./account-verify-email";
import AttendeeVerifyEmail from "./attendee-verify-email";
import AttendeeWasRequestedToRescheduleEmail from "./attendee-was-requested-to-reschedule-email";
import ChangeOfEmailVerifyEmail from "./change-account-email-verify";
import ForgotPasswordEmail from "./forgot-password-email";

const name = "Alex <Smith>";

// Static translations contain markup, as in the real strings; interpolated values are not escaped.
const language = ((key: string, options?: Record<string, unknown>) =>
  key === "hi_user_name" ? `Hi ${String(options?.name)}` : `<b>${key}</b>`) as unknown as TFunction;

class TestAccountVerifyEmail extends AccountVerifyEmail {
  public textBody() {
    return this.getTextBody();
  }
}

class TestAttendeeVerifyEmail extends AttendeeVerifyEmail {
  public textBody() {
    return this.getTextBody();
  }
}

class TestAttendeeWasRequestedToRescheduleEmail extends AttendeeWasRequestedToRescheduleEmail {
  public textBody() {
    return this.getTextBody();
  }
}

class TestChangeOfEmailVerifyEmail extends ChangeOfEmailVerifyEmail {
  public textBody() {
    return this.getTextBody();
  }
}

class TestForgotPasswordEmail extends ForgotPasswordEmail {
  public textBody() {
    return this.getTextBody();
  }
}

const cases = [
  {
    template: "forgot password",
    translatedKey: "reset_password_subject",
    getTextBody: () =>
      new TestForgotPasswordEmail({
        language,
        user: { name, email: "alex@example.com" },
        resetLink: "https://example.com/reset",
      }).textBody(),
  },
  {
    template: "account verification",
    translatedKey: "verify_email_subject",
    getTextBody: () =>
      new TestAccountVerifyEmail({
        language,
        user: { name, email: "alex@example.com" },
        verificationEmailLink: "https://example.com/verify",
      }).textBody(),
  },
  {
    template: "attendee verification",
    translatedKey: "verify_email_email_header",
    getTextBody: () =>
      new TestAttendeeVerifyEmail({
        language,
        user: { name, email: "alex@example.com" },
        verificationEmailCode: "123456",
      }).textBody(),
  },
  {
    template: "change of email",
    translatedKey: "verify_email_email_header",
    getTextBody: () =>
      new TestChangeOfEmailVerifyEmail({
        language,
        user: { name, emailFrom: "old@example.com", emailTo: "new@example.com" },
        verificationEmailLink: "https://example.com/verify",
      }).textBody(),
  },
];

describe("plain-text email bodies", () => {
  it.each(cases)("$template keeps angle brackets in the user's name", ({ getTextBody }) => {
    expect(getTextBody()).toContain(`Hi ${name},`);
  });

  it.each(cases)("$template strips markup from the translated text", ({ getTextBody, translatedKey }) => {
    const text = getTextBody();

    expect(text).toContain(translatedKey);
    expect(text).not.toContain("<b>");
  });

  it("reschedule request keeps angle brackets in the organizer's name and strips the HTML around the time", () => {
    const translate = ((key: string, options?: Record<string, unknown>) =>
      key === "request_reschedule_subtitle"
        ? `${String(options?.organizer)} requested a reschedule`
        : `<b>${key}</b>`) as unknown as TFunction;
    const calEvent = buildCalendarEvent({
      organizer: buildPerson({ name }),
      attendees: [buildPerson({ language: { locale: "en", translate } })],
    });

    const text = new TestAttendeeWasRequestedToRescheduleEmail(calEvent, {
      rescheduleLink: "https://example.com/reschedule",
    }).textBody();

    expect(text).toContain(`${name} requested a reschedule`);
    expect(text).toContain("request_reschedule_booking");
    expect(text).not.toContain("<b>");
    expect(text).not.toContain("<p");
  });
});
