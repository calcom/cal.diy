import { describe, expect, it } from "vitest";
import { cityTimezonesHandler } from "./cityTimezonesHandler";

describe("cityTimezonesHandler", () => {
  it("emits canonical IANA ids instead of pre-rename links", async () => {
    const cities = await cityTimezonesHandler();
    const timezones = new Set(cities.map((city) => city.timezone));

    expect(timezones.has("Europe/Kiev")).toBe(false);
    expect(timezones.has("Asia/Rangoon")).toBe(false);
    expect(timezones.has("Asia/Saigon")).toBe(false);

    expect(timezones.has("Europe/Kyiv")).toBe(true);
    expect(timezones.has("Asia/Yangon")).toBe(true);
    expect(timezones.has("Asia/Ho_Chi_Minh")).toBe(true);
  });
});
