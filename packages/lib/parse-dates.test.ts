import { describe, expect, it } from "vitest";
import { parseDateTimeWithTimeZone } from "./parse-dates";
import { TimeFormat } from "./timeFormat";

describe("parseDateTimeWithTimeZone", () => {
  const date = new Date("2026-11-04T14:30:00Z");

  it("formats the time in 12-hour notation by default", () => {
    expect(parseDateTimeWithTimeZone(date, "en", "UTC")).toBe("2:30pm, Wednesday, November 4, 2026");
  });

  it("formats the time in 24-hour notation when selectedTimeFormat is TWENTY_FOUR_HOUR", () => {
    expect(
      parseDateTimeWithTimeZone(date, "en", "UTC", {
        selectedTimeFormat: TimeFormat.TWENTY_FOUR_HOUR,
      })
    ).toBe("14:30, Wednesday, November 4, 2026");
  });

  it("does not leak the 24-hour format into subsequent calls", () => {
    parseDateTimeWithTimeZone(date, "en", "UTC", {
      selectedTimeFormat: TimeFormat.TWENTY_FOUR_HOUR,
    });

    expect(parseDateTimeWithTimeZone(date, "en", "UTC")).toBe("2:30pm, Wednesday, November 4, 2026");
  });

  it("prefers withDefaultTimeFormat over selectedTimeFormat", () => {
    expect(
      parseDateTimeWithTimeZone(date, "en", "UTC", {
        selectedTimeFormat: TimeFormat.TWENTY_FOUR_HOUR,
        withDefaultTimeFormat: true,
      })
    ).toBe("2:30pm, Wednesday, November 4, 2026");
  });
});
