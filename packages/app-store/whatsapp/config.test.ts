import { describe, it, expect } from "vitest";

import config from "./config.json";

describe("WhatsApp location config", () => {
  const { urlRegExp, organizerInputPlaceholder } = config.appData.location;
  const regex = new RegExp(urlRegExp);

  it("has a placeholder without a + sign or /send path", () => {
    expect(organizerInputPlaceholder).toBe("https://wa.me/4712345678");
  });

  it("accepts the canonical https://wa.me/<digits> link", () => {
    expect(regex.test("https://wa.me/4712345678")).toBe(true);
  });

  it("rejects the /send?phone= format and a leading +", () => {
    expect(regex.test("https://wa.me/send?phone=4712345678")).toBe(false);
    expect(regex.test("https://wa.me/+4712345678")).toBe(false);
  });

  it("rejects non-canonical variants (http, www, no number)", () => {
    expect(regex.test("http://wa.me/4712345678")).toBe(false);
    expect(regex.test("https://www.wa.me/4712345678")).toBe(false);
    expect(regex.test("https://wa.me/")).toBe(false);
  });
});
