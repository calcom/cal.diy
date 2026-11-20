import { describe, expect, it } from "vitest";
import appConfig from "./config.json";
import { appDataSchema } from "./zod";

describe("Privatus Analytics app", () => {
  it("accepts a valid site ID", () => {
    const result = appDataSchema.safeParse({ enabled: true, trackingId: "pa_7Q2K9XH3AB" });
    expect(result.success).toBe(true);
  });

  it("accepts an empty site ID so the app can be turned on before it is filled in", () => {
    expect(appDataSchema.safeParse({ enabled: true, trackingId: "" }).success).toBe(true);
    expect(appDataSchema.safeParse({ enabled: true }).success).toBe(true);
  });

  it.each([
    "7Q2K9XH3AB",
    "PA_7Q2K9XH3AB",
    "pa_",
    "pa_7Q2K 9XH3",
    'pa_7Q2K"onload="x',
  ])("rejects an invalid site ID: %s", (trackingId) => {
    expect(appDataSchema.safeParse({ enabled: true, trackingId }).success).toBe(false);
  });

  it("loads the Privatus Analytics script with the site ID", () => {
    const [script] = appConfig.appData.tag.scripts;
    expect(script.src).toBe("https://privatusstats.com/js/pa.js");
    expect(script.attrs["data-site"]).toBe("{TRACKING_ID}");
  });
});
