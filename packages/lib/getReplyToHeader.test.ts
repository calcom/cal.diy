import { describe, expect, it, vi } from "vitest";

import { getReplyToHeader } from "./getReplyToHeader";

/**
 * RFC 5322 (Internet Message Format) specifies that the Reply-To header must be
 * a comma-separated list of addresses, not an array. Many SMTP servers reject arrays.
 * Spec: https://datatracker.ietf.org/doc/html/rfc5322#section-3.6.2
 */

vi.mock("./getReplyToEmail", () => ({  
  getReplyToEmail: vi.fn((calEvent, excludeOrganizerEmail) => {  
    if (calEvent.customReplyToEmail) return calEvent.customReplyToEmail;  
    if (excludeOrganizerEmail) return null;  
    return calEvent.organizer?.email || null;  
  }),  
}));

const createMockCalEvent = (organizerEmail: string) => ({
  organizer: { email: organizerEmail },
  hideOrganizerEmail: false,
});

describe("getReplyToHeader", () => {
  describe("return type", () => {
    it("always returns replyTo as a string, never an array", () => {
      const calEvent = createMockCalEvent("organizer@test.com");
      const result = getReplyToHeader(calEvent as any, ["attendee1@test.com", "attendee2@test.com"]);

      expect(result).toHaveProperty("replyTo");
      expect(typeof result.replyTo).toBe("string");
      // Should NOT be an array
      expect(Array.isArray(result.replyTo)).toBe(false);
    });
  });

  describe("with single email", () => {
    it("returns single email as string", () => {
      const calEvent = createMockCalEvent("organizer@test.com");
      const result = getReplyToHeader(calEvent as any);

      expect(result).toEqual({ replyTo: "organizer@test.com" });
    });

    it("returns additionalEmail as string when provided alone", () => {
      const calEvent = createMockCalEvent("organizer@test.com");
      const result = getReplyToHeader(calEvent as any, "additional@test.com", true);

      expect(result).toEqual({ replyTo: "additional@test.com" });
    });
  });

  describe("with multiple emails", () => {
    it("returns comma-separated string for multiple emails", () => {
      const calEvent = createMockCalEvent("organizer@test.com");
      const result = getReplyToHeader(calEvent as any, ["attendee1@test.com", "attendee2@test.com"]);

      expect(result).toEqual({
        replyTo: "attendee1@test.com, attendee2@test.com, organizer@test.com",
      });
    });

    it("returns comma-separated string when additionalEmails is array", () => {
      const calEvent = createMockCalEvent("organizer@test.com");
      const result = getReplyToHeader(calEvent as any, ["a@test.com", "b@test.com", "c@test.com"], true);

      expect(result).toEqual({
        replyTo: "a@test.com, b@test.com, c@test.com",
      });
    });
  });

  describe("with no emails", () => {
    it("returns empty object when no emails available", () => {
      const calEvent = { organizer: { email: "" }, hideOrganizerEmail: true };
      const result = getReplyToHeader(calEvent as any, undefined, true);

      expect(result).toEqual({});
    });
  });

  describe("SMTP compatibility", () => {
    it("produces RFC 5322 compliant Reply-To header format", () => {
      const calEvent = createMockCalEvent("organizer@test.com");
      const result = getReplyToHeader(calEvent as any, ["a@test.com", "b@test.com"]);

      // RFC 5322 specifies comma-separated list for multiple addresses
      expect(result.replyTo).toMatch(/^[^,]+, [^,]+, [^,]+$/);
      expect(result.replyTo).not.toContain("[");
      expect(result.replyTo).not.toContain("]");
    });
  });

  describe("with hideOrganizerEmail and customReplyToEmail", () => {  
  it("uses customReplyToEmail even when hideOrganizerEmail is true", () => {  
    const calEvent = {  
      organizer: { email: "org@test.com" },  
      hideOrganizerEmail: true,  
      customReplyToEmail: "custom@test.com",  
    };  
    const result = getReplyToHeader(calEvent as any, undefined, true);  
    expect(result).toEqual({ replyTo: "custom@test.com" });  
  });  
});
});
