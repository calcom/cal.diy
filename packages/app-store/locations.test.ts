import { describe, expect, it } from "vitest";
import { getLocationFromApp, guessEventLocationType } from "./locations";

describe("WhatsApp static location", () => {
  it("accepts canonical links and rejects send links", () => {
    expect(guessEventLocationType("https://wa.me/4712345678")).toEqual(
      expect.objectContaining({ type: "integrations:whatsapp_video" })
    );
    expect(guessEventLocationType("https://wa.me/send?phone=4712345678")).toBeUndefined();
    expect(guessEventLocationType("https://wa.me/+4712345678")).toBeUndefined();
    expect(guessEventLocationType("https://wa.me/4712345678?foo=bar")).toBeUndefined();
  });

  it("exposes the canonical wa.me setup example", () => {
    expect(getLocationFromApp("integrations:whatsapp_video")?.organizerInputPlaceholder?.trim()).toBe(
      "https://wa.me/1234567890"
    );
  });
});
