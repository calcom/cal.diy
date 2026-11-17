import { describe, expect, it } from "vitest";
import { constructEmailFromPhoneNumber, contructEmailFromPhoneNumber } from "./contructEmailFromPhoneNumber";

describe("contructEmailFromPhoneNumber", () => {
  it("strips leading + from international phone numbers", () => {
    expect(contructEmailFromPhoneNumber("+1234567890")).toBe("1234567890@sms.cal.com");
  });

  it("strips spaces and formatting from phone numbers", () => {
    expect(contructEmailFromPhoneNumber("+44 7911 123456")).toBe("447911123456@sms.cal.com");
    expect(contructEmailFromPhoneNumber("+91 98765 43210")).toBe("919876543210@sms.cal.com");
  });

  it("strips parentheses, dashes, and dots from phone numbers", () => {
    expect(contructEmailFromPhoneNumber("+1 (555) 123-4567")).toBe("15551234567@sms.cal.com");
    expect(contructEmailFromPhoneNumber("+1-800-555-0199")).toBe("18005550199@sms.cal.com");
    expect(contructEmailFromPhoneNumber("1.800.555.0199")).toBe("18005550199@sms.cal.com");
  });

  it("handles leading and trailing whitespace", () => {
    expect(contructEmailFromPhoneNumber("  +1 (555) 000-1111  ")).toBe("15550001111@sms.cal.com");
  });

  it("works with unformatted plain digits", () => {
    expect(contructEmailFromPhoneNumber("1234567890")).toBe("1234567890@sms.cal.com");
  });

  it("exports constructEmailFromPhoneNumber alias with identical behavior", () => {
    expect(constructEmailFromPhoneNumber("+1 (555) 123-4567")).toBe(
      contructEmailFromPhoneNumber("+1 (555) 123-4567")
    );
  });
});
