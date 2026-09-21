import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import { getReplyToEmail } from "./getReplyToEmail";

describe("getReplyToEmail", () => {
  it("returns the customReplyToEmail if it is set", () => {
    const calEvent = {
      customReplyToEmail: "customReplyToEmail@example.com",
      organizer: {
        name: "Organizer",
        email: "organizer@example.com",
        timeZone: "UTC",
        language: {
          locale: "en",
          translate: ((key: string) => key) as TFunction,
        },
      },
    };
    expect(getReplyToEmail(calEvent)).toBe("customReplyToEmail@example.com");
  });
  it("returns the organizer's email if customReplyToEmail is not set", () => {
    const calEvent = {
      customReplyToEmail: null,
      organizer: {
        name: "Organizer",
        email: "organizer@example.com",
        timeZone: "UTC",
        language: {
          locale: "en",
          translate: ((key: string) => key) as TFunction,
        },
      },
    };
    expect(getReplyToEmail(calEvent)).toBe("organizer@example.com");
  });
});
