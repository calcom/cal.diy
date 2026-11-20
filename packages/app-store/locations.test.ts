import { describe, expect, it } from "vitest";

import whatsappConfig from "./whatsapp/config.json";

describe("WhatsApp location configuration", () => {
  it("uses the clean wa.me URL format for organizerInputPlaceholder without send?phone=", () => {
    const placeholder = whatsappConfig.appData.location.organizerInputPlaceholder;
    expect(placeholder).toBe("https://wa.me/1234567890");
    expect(placeholder).not.toContain("send?phone=");
    expect(placeholder).not.toContain("+");
  });

  it("validates clean wa.me URLs against urlRegExp", () => {
    const regExp = new RegExp(whatsappConfig.appData.location.urlRegExp);
    expect(regExp.test("https://wa.me/4712345678")).toBe(true);
    expect(regExp.test("http://wa.me/1234567890")).toBe(true);
  });
});
