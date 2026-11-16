import { describe, expect, it } from "vitest";

import { TimeFormat } from "@calcom/lib/timeFormat";

import { parseDateTimeWithTimeZone } from "../parse-dates";

describe("parseDateTimeWithTimeZone", () => {
  const testDate = new Date("2026-11-04T14:30:00Z");

  it("should not leak time format or hourCycle between subsequent calls (#30510)", () => {
    // 1. Initial call with default (12-hour)
    const call1 = parseDateTimeWithTimeZone(testDate, "en", "UTC");
    expect(call1).toContain("2:30pm");

    // 2. Call requesting 24-hour format
    const call2 = parseDateTimeWithTimeZone(testDate, "en", "UTC", {
      selectedTimeFormat: TimeFormat.TWENTY_FOUR_HOUR,
    });
    expect(call2).toContain("14:30");

    // 3. Subsequent call without options should remain 12-hour (no leakage from call 2)
    const call3 = parseDateTimeWithTimeZone(testDate, "en", "UTC");
    expect(call3).toEqual(call1);
    expect(call3).toContain("2:30pm");

    // 4. Call requesting 12-hour format explicitly
    const call4 = parseDateTimeWithTimeZone(testDate, "en", "UTC", {
      selectedTimeFormat: TimeFormat.TWELVE_HOUR,
    });
    expect(call4).toEqual(call1);
  });

  it("should respect withDefaultTimeFormat option", () => {
    const res = parseDateTimeWithTimeZone(testDate, "en", "UTC", {
      withDefaultTimeFormat: true,
      selectedTimeFormat: TimeFormat.TWENTY_FOUR_HOUR,
    });
    expect(res).toContain("2:30pm");
  });

  it("should format correctly across different timezones without state contamination", () => {
    const ny = parseDateTimeWithTimeZone(testDate, "en", "America/New_York");
    const tokyo = parseDateTimeWithTimeZone(testDate, "en", "Asia/Tokyo");

    expect(ny).toContain("9:30am");
    expect(tokyo).toContain("11:30pm");
  });
});
