import { describe, expect, it } from "vitest";

import config from "../config.json";

describe("WhatsApp location configuration and URL validation", () => {
  const { urlRegExp, organizerInputPlaceholder } = config.appData.location;
  const regex = new RegExp(urlRegExp);

  it("should have updated organizerInputPlaceholder to clean wa.me format", () => {
    expect(organizerInputPlaceholder).toBe("https://wa.me/1234567890");
    expect(organizerInputPlaceholder).not.toContain("send?phone=");
    expect(organizerInputPlaceholder).not.toContain("+");
  });

  describe("valid WhatsApp URLs", () => {
    it("matches standard https URL", () => {
      expect(regex.test("https://wa.me/1234567890")).toBe(true);
    });

    it("matches international number with country code", () => {
      expect(regex.test("https://wa.me/4712345678")).toBe(true);
    });

    it("matches http URL", () => {
      expect(regex.test("http://wa.me/1234567890")).toBe(true);
    });
  });

  describe("invalid WhatsApp URLs", () => {
    it("rejects legacy send format with query params", () => {
      expect(regex.test("https://wa.me/send?phone=1234567890")).toBe(false);
    });

    it("rejects + prefix", () => {
      expect(regex.test("https://wa.me/+4712345678")).toBe(false);
    });

    it("rejects trailing slash with no number", () => {
      expect(regex.test("https://wa.me/")).toBe(false);
    });

    it("rejects other domains", () => {
      expect(regex.test("https://other.com/1234567890")).toBe(false);
    });

    it("requires protocol (rejects URL without http/https)", () => {
      expect(regex.test("wa.me/1234567890")).toBe(false);
    });
  });
});
