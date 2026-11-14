import i18next from "i18next";
import { describe, expect, it } from "vitest";
import enCommon from "../i18n/locales/en/common.json";
import { getLocationByType, locationsResolver } from "./locations";

const createT = async () => {
  const i18n = i18next.createInstance();
  await i18n.init({
    lng: "en",
    resources: { en: { translation: enCommon } },
    initImmediate: false,
  });
  return i18n.t.bind(i18n);
};

describe("locationsResolver", () => {
  it("shows the sample URL unescaped when a static location link is invalid", async () => {
    const t = await createT();
    const sampleUrl = getLocationByType("integrations:telegram_video")?.organizerInputPlaceholder;
    if (!sampleUrl) throw new Error("Telegram location type has no sample URL");

    const result = locationsResolver(t).safeParse([
      { type: "integrations:telegram_video", link: "https://example.com/not-a-telegram-link" },
    ]);

    expect(result.success).toBe(false);
    if (result.success) return;
    const { message } = result.error.issues[0];
    expect(message).toContain("Sample URL: ");
    expect(message).toContain(sampleUrl);
    expect(message).not.toContain("&#x2F;");
  });
});
