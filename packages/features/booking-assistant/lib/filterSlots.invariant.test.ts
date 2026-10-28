import type { IGetAvailableSlots } from "@calcom/features/bookings/Booker/hooks/useAvailableTimeSlots";
import { describe, expect, it } from "vitest";
import type { FilterSlotsParams } from "./filterSlots";
import { filterSlots } from "./filterSlots";

type Filter = FilterSlotsParams["filter"];

const HALF_HOUR = 30 * 60 * 1000;

const everyHalfHour = (fromIso: string, days: number) =>
  Array.from({ length: days * 48 }, (_, index) =>
    new Date(Date.parse(fromIso) + index * HALF_HOUR).toISOString()
  );

// Half-hourly slots; the second and third ranges cover New York's 2026 autumn and 2027 spring DST changes.
const ENGINE_TIMES = [
  ...everyHalfHour("2026-10-09T00:00:00.000Z", 12),
  ...everyHalfHour("2026-10-29T00:00:00.000Z", 6),
  ...everyHalfHour("2027-03-10T00:00:00.000Z", 6),
];
const ENGINE_SLOTS: IGetAvailableSlots["slots"] = { all: ENGINE_TIMES.map((time) => ({ time })) };

// Independent of filterSlots: plain Intl and arithmetic, so a shared bug can't hide itself.
const localParts = (iso: string, timeZone: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: +parts.hour * 60 + +parts.minute };
};

const shiftDate = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

const dayMatches = (day: string, filter: Filter) =>
  day >= filter.dateFrom &&
  day <= filter.dateTo &&
  (filter.weekdays.length === 0 || filter.weekdays.includes(new Date(`${day}T00:00:00Z`).getUTCDay()));

const toMinutes = (time: string) => +time.slice(0, 2) * 60 + +time.slice(3, 5);

const isInsideFilter = (iso: string, filter: Filter, timeZone: string) => {
  const { date, minutes } = localParts(iso, timeZone);
  if (filter.timeWindows.length === 0) return dayMatches(date, filter);
  return filter.timeWindows.some(({ from, to }) => {
    const start = toMinutes(from);
    const end = toMinutes(to);
    if (start < end) return minutes >= start && minutes < end && dayMatches(date, filter);
    // Wrapping window: the evening part belongs to its own day, the after-midnight part to the day before.
    if (minutes >= start) return dayMatches(date, filter);
    return minutes < end && dayMatches(shiftDate(date, -1), filter);
  });
};

const TIME_ZONES = [
  "UTC",
  "Africa/Casablanca",
  "Europe/London",
  "America/New_York",
  "Asia/Kolkata",
  "Asia/Kathmandu",
  "Pacific/Chatham",
];

const FILTERS: Omit<Filter, "preference">[] = [
  {
    dateFrom: "2026-10-13",
    dateTo: "2026-10-13",
    timeWindows: [{ from: "12:00", to: "17:00" }],
    weekdays: [],
  },
  {
    dateFrom: "2026-10-09",
    dateTo: "2026-10-20",
    timeWindows: [{ from: "08:00", to: "12:00" }],
    weekdays: [5],
  },
  {
    dateFrom: "2026-10-09",
    dateTo: "2026-10-20",
    timeWindows: [{ from: "15:00", to: "00:00" }],
    weekdays: [],
  },
  {
    dateFrom: "2026-10-15",
    dateTo: "2026-10-17",
    timeWindows: [{ from: "22:00", to: "01:00" }],
    weekdays: [5],
  },
  {
    dateFrom: "2026-10-09",
    dateTo: "2026-10-20",
    timeWindows: [
      { from: "07:00", to: "09:00" },
      { from: "18:00", to: "20:00" },
    ],
    weekdays: [1, 3],
  },
  {
    dateFrom: "2026-10-31",
    dateTo: "2026-11-02",
    timeWindows: [{ from: "00:30", to: "02:30" }],
    weekdays: [],
  },
  {
    dateFrom: "2027-03-13",
    dateTo: "2027-03-15",
    timeWindows: [{ from: "01:00", to: "04:00" }],
    weekdays: [],
  },
];

const PREFERENCES: Filter["preference"][] = ["earliest", "latest", "spread"];

describe("filterSlots invariant: every suggestion lies inside the interpreted window", () => {
  for (const timeZone of TIME_ZONES) {
    it(`holds for every filter and preference in ${timeZone}`, () => {
      let checked = 0;
      for (const baseFilter of FILTERS) {
        for (const preference of PREFERENCES) {
          const filter = { ...baseFilter, preference };
          const suggestions = filterSlots({ slots: ENGINE_SLOTS, filter, timeZone });

          expect(suggestions.length).toBeLessThanOrEqual(3);
          for (const suggestion of suggestions) {
            expect(ENGINE_TIMES).toContain(suggestion);
            expect(
              isInsideFilter(suggestion, filter, timeZone),
              `${suggestion} (${JSON.stringify(localParts(suggestion, timeZone))}) is outside ${JSON.stringify(filter)} in ${timeZone}`
            ).toBe(true);
            checked += 1;
          }
        }
      }
      // Guards against a vacuous pass where nothing was ever suggested.
      expect(checked).toBeGreaterThan(30);
    });
  }
});
