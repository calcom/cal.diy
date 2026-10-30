import dayjs from "@calcom/dayjs";
import { describe, expect, it } from "vitest";
import { processWorkingHours } from "./date-ranges";

// Runs under the server timezone set by CI (TZ=America/Los_Angeles in timezone mode).
// A host's working hours must not depend on the server's own timezone, including on DST transition days.
const transitionDays: { timeZone: string; date: string }[] = [
  { timeZone: "America/New_York", date: "2026-03-08" },
  { timeZone: "America/New_York", date: "2026-11-01" },
  { timeZone: "Europe/London", date: "2026-03-29" },
  { timeZone: "Europe/London", date: "2026-10-25" },
  { timeZone: "Australia/Sydney", date: "2026-10-04" },
];

const workingHours: { start: number; end: number }[] = [
  { start: 9, end: 17 },
  { start: 13, end: 18 },
];

const pad = (hour: number): string => String(hour).padStart(2, "0");

describe("processWorkingHours on DST transition days", () => {
  for (const { timeZone, date } of transitionDays) {
    for (const { start, end } of workingHours) {
      it(`keeps ${pad(start)}:00-${pad(end)}:00 for a ${timeZone} host on ${date}`, () => {
        const item = {
          days: [0, 1, 2, 3, 4, 5, 6],
          startTime: new Date(Date.UTC(1970, 0, 1, start, 0)),
          endTime: new Date(Date.UTC(1970, 0, 1, end, 0)),
        };

        const results = Object.values(
          processWorkingHours(
            {},
            {
              item,
              timeZone,
              dateFrom: dayjs.tz(date, timeZone).subtract(1, "day"),
              dateTo: dayjs.tz(date, timeZone).add(2, "day"),
              travelSchedules: [],
            }
          )
        );

        const rangesOnTransitionDay = results
          .filter((range) => range.start.tz(timeZone).format("YYYY-MM-DD") === date)
          .map(
            (range) => `${range.start.tz(timeZone).format("HH:mm")}-${range.end.tz(timeZone).format("HH:mm")}`
          );

        expect(rangesOnTransitionDay).toEqual([`${pad(start)}:00-${pad(end)}:00`]);
      });
    }
  }
});
