import { describe, expect, it } from "vitest";

import config from "./config.json";

const { organizerInputPlaceholder, urlRegExp } = config.appData.location;
const linkPattern = new RegExp(urlRegExp);

describe("whatsapp location link validation", () => {
  it("accepts the placeholder shown to the organizer", () => {
    expect(linkPattern.test(organizerInputPlaceholder)).toBe(true);
  });

  it.each([
    ["a plain international number", "https://wa.me/4712345678"],
    ["a longer number", "https://wa.me/551199998888"],
    ["http instead of https", "http://wa.me/4712345678"],
    ["the www host", "https://www.wa.me/4712345678"],
    ["a prefilled message", "https://wa.me/4712345678?text=Hi%20there"],
    ["a short-link invite", "https://wa.me/message/ABCD1234EFGH5"],
    ["a qr link", "https://wa.me/qr/ABCD1234EFGH5"],
  ])("accepts %s", (_label, link) => {
    expect(linkPattern.test(link)).toBe(true);
  });

  it.each([
    ["the send?phone= form reported in the issue", "https://wa.me/send?phone=4712345678"],
    ["a leading + on the number", "https://wa.me/+4712345678"],
    ["no number at all", "https://wa.me/"],
    ["a non-numeric handle", "https://wa.me/someone"],
    ["a number that is too short", "https://wa.me/123"],
    ["a number that is too long", "https://wa.me/1234567890123456"],
    ["an unrelated host that merely resembles wa.me", "https://waXme/4712345678"],
    ["extra path segments", "https://wa.me/4712345678/anything"],
    ["wa.me only inside a fragment of another host", "https://evil.example/#https://wa.me/4712345678"],
  ])("rejects %s", (_label, link) => {
    expect(linkPattern.test(link)).toBe(false);
  });
});
