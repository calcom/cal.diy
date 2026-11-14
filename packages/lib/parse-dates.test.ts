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
    const fourthCall = parseDateTimeWithTimeZone(date, "en", "UTC", {
      selectedTimeFormat: TimeFormat.TWELVE_HOUR,
    });
    const fifthCall = parseDateTimeWithTimeZone(date, "en", "UTC", {
      withDefaultTimeFormat: true,
      selectedTimeFormat: TimeFormat.TWENTY_FOUR_HOUR,
    });

    expect(firstCall).toBe("2:30pm, Wednesday, November 4, 2026");
    expect(secondCall).toBe("14:30, Wednesday, November 4, 2026");
    expect(thirdCall).toBe("2:30pm, Wednesday, November 4, 2026");
    expect(fourthCall).toBe("2:30pm, Wednesday, November 4, 2026");
    expect(fifthCall).toBe("2:30pm, Wednesday, November 4, 2026");
  });

  it("does not leak timezone across sequential calls", () => {
    const date = new Date("2026-11-04T14:30:00Z");

    const utc1 = parseDateTimeWithTimeZone(date, "en", "UTC");
    const kiritimati = parseDateTimeWithTimeZone(date, "en", "Pacific/Kiritimati");
    const utc2 = parseDateTimeWithTimeZone(date, "en", "UTC");

    expect(utc1).toBe("2:30pm, Wednesday, November 4, 2026");
    expect(kiritimati).toBe("4:30am, Thursday, November 5, 2026");
    expect(utc2).toBe("2:30pm, Wednesday, November 4, 2026");
  });
});
