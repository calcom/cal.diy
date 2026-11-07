import { describe, expect, it } from "vitest";

import { TimeFormat } from "@calcom/lib/timeFormat";

import { parseDateTimeWithTimeZone } from "./parse-dates";

describe("parseDateTimeWithTimeZone", () => {
  it("does not leak time format across sequential calls with different options", () => {
    const date = new Date("2026-11-04T14:30:00Z");

    const firstCall = parseDateTimeWithTimeZone(date, "en", "UTC");
    const secondCall = parseDateTimeWithTimeZone(date, "en", "UTC", {
      selectedTimeFormat: TimeFormat.TWENTY_FOUR_HOUR,
    });
    const thirdCall = parseDateTimeWithTimeZone(date, "en", "UTC");

    expect(firstCall).toBe("2:30pm, Wednesday, November 4, 2026");
    expect(secondCall).toBe("14:30, Wednesday, November 4, 2026");
    expect(thirdCall).toBe("2:30pm, Wednesday, November 4, 2026");
  });
});
