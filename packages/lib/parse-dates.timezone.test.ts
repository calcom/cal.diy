process.env.TZ = "Asia/Dubai";

import dayjs from "@calcom/dayjs";
import { Frequency } from "rrule";
import { describe, expect, it } from "vitest";

import { parseRecurringDates } from "./parse-dates";

describe("parseRecurringDates DST handling", () => {
  it("keeps occurrences at a constant wall-clock in the event timezone across a DST change, independent of the runtime timezone", () => {
    // Runtime TZ is Asia/Dubai (set above); the meeting timezone is America/New_York.
    // A weekly 10:00 New York booking that crosses US spring-forward (2025-03-09) must keep
    // every occurrence at 10:00 New York rather than drifting to 11:00 for a booker whose
    // browser timezone differs from the meeting timezone.
    const [, recurringDates] = parseRecurringDates(
      {
        startDate: "2025-03-05T10:00:00-05:00",
        timeZone: "America/New_York",
        recurringEvent: { freq: Frequency.WEEKLY, interval: 1, count: 4 },
        recurringCount: 4,
      },
      "en"
    );

    const wallClock = recurringDates.map((date) =>
      dayjs.utc(date).tz("America/New_York").format("YYYY-MM-DD HH:mm")
    );

    expect(wallClock).toEqual([
      "2025-03-05 10:00",
      "2025-03-12 10:00",
      "2025-03-19 10:00",
      "2025-03-26 10:00",
    ]);
  });
});
