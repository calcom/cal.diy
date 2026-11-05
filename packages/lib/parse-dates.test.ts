import { describe, expect, it } from "vitest";

import { TimeFormat } from "@calcom/lib/timeFormat";

import { parseDateTimeWithTimeZone } from "./parse-dates";

const TEST_DATE = new Date("2024-06-15T14:30:00Z");
const TZ = "America/New_York";
const LANG = "en-US";

describe("parseDateTimeWithTimeZone", () => {
  it("formats in 12-hour mode by default (withDefaultTimeFormat)", () => {
    const result = parseDateTimeWithTimeZone(TEST_DATE, LANG, TZ, {
      withDefaultTimeFormat: true,
    });
    // 14:30 UTC = 10:30 AM EDT
    expect(result).toMatch(/10:30am/i);
    expect(result).not.toMatch(/^14/);
  });

  it("formats in 24-hour mode when selectedTimeFormat is TWENTY_FOUR_HOUR", () => {
    const result = parseDateTimeWithTimeZone(TEST_DATE, LANG, TZ, {
      selectedTimeFormat: TimeFormat.TWENTY_FOUR_HOUR,
    });
    // Should show 10:30 in 24h style (no am/pm)
    expect(result).toMatch(/10:30/);
    expect(result.toLowerCase()).not.toMatch(/am|pm/);
  });

  it("does NOT corrupt subsequent 12-hour calls after a 24-hour call (issue #30510)", () => {
    // First call in 24-hour mode — this previously deleted timeOptions.hour12 from the shared object
    parseDateTimeWithTimeZone(TEST_DATE, LANG, TZ, {
      selectedTimeFormat: TimeFormat.TWENTY_FOUR_HOUR,
    });

    // Second call back in 12-hour mode — must still produce am/pm
    const result = parseDateTimeWithTimeZone(TEST_DATE, LANG, TZ, {
      selectedTimeFormat: TimeFormat.TWELVE_HOUR,
    });
    expect(result.toLowerCase()).toMatch(/am|pm/);
    expect(result).toMatch(/10:30/);
  });

  it("does NOT corrupt timezone across subsequent calls with different timezones", () => {
    const nyResult = parseDateTimeWithTimeZone(TEST_DATE, LANG, "America/New_York", {
      withDefaultTimeFormat: true,
    });
    const laResult = parseDateTimeWithTimeZone(TEST_DATE, LANG, "America/Los_Angeles", {
      withDefaultTimeFormat: true,
    });

    // NY = UTC-4 (EDT) = 10:30 AM; LA = UTC-7 (PDT) = 7:30 AM
    expect(nyResult).toMatch(/10:30/);
    expect(laResult).toMatch(/7:30/);
    expect(nyResult).not.toBe(laResult);
  });

  it("repeated 12-hour calls stay in 12-hour mode", () => {
    for (let i = 0; i < 3; i++) {
      const result = parseDateTimeWithTimeZone(TEST_DATE, LANG, TZ, {
        selectedTimeFormat: TimeFormat.TWELVE_HOUR,
      });
      expect(result.toLowerCase()).toMatch(/am|pm/);
    }
  });
});
