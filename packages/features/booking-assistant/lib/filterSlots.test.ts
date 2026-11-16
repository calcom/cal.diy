import type { IGetAvailableSlots } from "@calcom/features/bookings/Booker/hooks/useAvailableTimeSlots";
import { ErrorWithCode } from "@calcom/lib/errors";
import { describe, expect, it } from "vitest";
import type { FilterSlotsParams } from "./filterSlots";
import { filterSlots } from "./filterSlots";

type Slot = IGetAvailableSlots["slots"][string][number];

// Keyed by UTC date on purpose: filterSlots must not rely on the engine's date keys.
const toSlots = (slots: (string | Slot)[]): IGetAvailableSlots["slots"] => {
  const result: IGetAvailableSlots["slots"] = {};
  for (const entry of slots) {
    const slot = typeof entry === "string" ? { time: entry } : entry;
    const key = slot.time.slice(0, 10);
    result[key] = [...(result[key] ?? []), slot];
  }
  return result;
};

const baseFilter: FilterSlotsParams["filter"] = {
  dateFrom: "2026-10-12",
  dateTo: "2026-10-18",
  timeWindows: [],
  weekdays: [],
  preference: "earliest",
};

const run = (slots: (string | Slot)[], filter: Partial<FilterSlotsParams["filter"]> = {}, timeZone = "UTC") =>
  filterSlots({ slots: toSlots(slots), filter: { ...baseFilter, ...filter }, timeZone });

describe("filterSlots", () => {
  describe("date range", () => {
    it("keeps only slots whose local date is within the range", () => {
      expect(
        run(
          [
            "2026-10-11T23:00:00.000Z",
            "2026-10-12T00:00:00.000Z",
            "2026-10-18T23:30:00.000Z",
            "2026-10-19T00:00:00.000Z",
          ],
          {}
        )
      ).toEqual(["2026-10-12T00:00:00.000Z", "2026-10-18T23:30:00.000Z"]);
    });

    it("uses the booker's local date, not the UTC date", () => {
      // 02:00Z on the 14th is 22:00 on the 13th in New York (EDT, UTC-4).
      expect(
        run(
          ["2026-10-14T02:00:00.000Z", "2026-10-14T13:00:00.000Z"],
          {
            dateFrom: "2026-10-13",
            dateTo: "2026-10-13",
          },
          "America/New_York"
        )
      ).toEqual(["2026-10-14T02:00:00.000Z"]);
    });
  });

  describe("weekdays", () => {
    it("keeps only the requested weekdays", () => {
      // 2026-10-13 is a Tuesday, 2026-10-14 a Wednesday, 2026-10-15 a Thursday.
      expect(
        run(["2026-10-13T09:00:00.000Z", "2026-10-14T09:00:00.000Z", "2026-10-15T09:00:00.000Z"], {
          weekdays: [2, 4],
        })
      ).toEqual(["2026-10-13T09:00:00.000Z", "2026-10-15T09:00:00.000Z"]);
    });

    it("uses the booker's weekday, not the UTC weekday", () => {
      // Wednesday 02:00Z is still Tuesday evening in New York.
      expect(run(["2026-10-14T02:00:00.000Z"], { weekdays: [2] }, "America/New_York")).toEqual([
        "2026-10-14T02:00:00.000Z",
      ]);
    });
  });

  describe("time windows", () => {
    it("treats the window start as inclusive and the end as exclusive in the booker's timezone", () => {
      // Kolkata is UTC+5:30, so 07:30Z is 13:00 and 11:30Z is 17:00.
      expect(
        run(
          [
            "2026-10-13T07:00:00.000Z",
            "2026-10-13T07:30:00.000Z",
            "2026-10-13T11:00:00.000Z",
            "2026-10-13T11:30:00.000Z",
          ],
          { timeWindows: [{ from: "13:00", to: "17:00" }] },
          "Asia/Kolkata"
        )
      ).toEqual(["2026-10-13T07:30:00.000Z", "2026-10-13T11:00:00.000Z"]);
    });

    it("matches any of several windows", () => {
      expect(
        run(["2026-10-13T08:00:00.000Z", "2026-10-13T12:00:00.000Z", "2026-10-13T18:00:00.000Z"], {
          timeWindows: [
            { from: "07:00", to: "09:00" },
            { from: "17:00", to: "19:00" },
          ],
        })
      ).toEqual(["2026-10-13T08:00:00.000Z", "2026-10-13T18:00:00.000Z"]);
    });

    it("supports windows that cross midnight", () => {
      expect(
        run(
          [
            "2026-10-13T21:59:00.000Z",
            "2026-10-13T23:00:00.000Z",
            "2026-10-14T00:30:00.000Z",
            "2026-10-14T01:00:00.000Z",
          ],
          { timeWindows: [{ from: "22:00", to: "01:00" }] }
        )
      ).toEqual(["2026-10-13T23:00:00.000Z", "2026-10-14T00:30:00.000Z"]);
    });

    it("counts after-midnight slots towards the previous evening for weekdays", () => {
      // "Friday night": Saturday 00:30 belongs to it, Friday 00:30 is the end of Thursday night.
      expect(
        run(["2026-10-16T00:30:00.000Z", "2026-10-16T23:00:00.000Z", "2026-10-17T00:30:00.000Z"], {
          weekdays: [5],
          timeWindows: [{ from: "22:00", to: "01:00" }],
        })
      ).toEqual(["2026-10-16T23:00:00.000Z", "2026-10-17T00:30:00.000Z"]);
    });

    it("counts after-midnight slots towards the previous evening for the date range", () => {
      expect(
        run(["2026-10-13T00:30:00.000Z", "2026-10-13T23:00:00.000Z", "2026-10-14T00:30:00.000Z"], {
          dateFrom: "2026-10-13",
          dateTo: "2026-10-13",
          timeWindows: [{ from: "22:00", to: "01:00" }],
        })
      ).toEqual(["2026-10-13T23:00:00.000Z", "2026-10-14T00:30:00.000Z"]);
    });

    it("keeps a slot that matches another window on its own day", () => {
      // 00:30 on the 13th is outside the range as part of the 12th's night, but inside the 00:00-02:00 window.
      expect(
        run(["2026-10-13T00:30:00.000Z"], {
          dateFrom: "2026-10-13",
          dateTo: "2026-10-13",
          timeWindows: [
            { from: "22:00", to: "01:00" },
            { from: "00:00", to: "02:00" },
          ],
        })
      ).toEqual(["2026-10-13T00:30:00.000Z"]);
    });
  });

  describe("daylight saving time", () => {
    it("keeps the whole night across the autumn change, including the repeated hour", () => {
      // The night of 2026-10-31 in New York: 22:00 EDT, 01:30 EDT, 01:30 EST, then 02:30 EST.
      expect(
        run(
          [
            "2026-11-01T02:00:00.000Z",
            "2026-11-01T05:30:00.000Z",
            "2026-11-01T06:30:00.000Z",
            "2026-11-01T07:30:00.000Z",
          ],
          { dateFrom: "2026-10-31", dateTo: "2026-10-31", timeWindows: [{ from: "22:00", to: "02:00" }] },
          "America/New_York"
        )
      ).toEqual(["2026-11-01T02:00:00.000Z", "2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"]);
    });

    it("keeps the same local window across the autumn change", () => {
      // New York leaves EDT (UTC-4) for EST (UTC-5) on 2026-11-01, so 09:00 local moves from 13:00Z to 14:00Z.
      const slots = [
        "2026-10-31T13:00:00.000Z",
        "2026-10-31T14:00:00.000Z",
        "2026-11-01T13:00:00.000Z",
        "2026-11-01T14:00:00.000Z",
        "2026-11-02T13:00:00.000Z",
        "2026-11-02T14:00:00.000Z",
      ];

      expect(
        run(
          slots,
          { dateFrom: "2026-10-31", dateTo: "2026-11-02", timeWindows: [{ from: "09:00", to: "10:00" }] },
          "America/New_York"
        )
      ).toEqual(["2026-10-31T13:00:00.000Z", "2026-11-01T14:00:00.000Z", "2026-11-02T14:00:00.000Z"]);
    });

    it("keeps both occurrences of a repeated local hour", () => {
      // 01:30 happens twice in New York on 2026-11-01: 05:30Z (EDT) and 06:30Z (EST).
      expect(
        run(
          ["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z", "2026-11-01T07:30:00.000Z"],
          { dateFrom: "2026-11-01", dateTo: "2026-11-01", timeWindows: [{ from: "01:00", to: "02:00" }] },
          "America/New_York"
        )
      ).toEqual(["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"]);
    });

    it("keeps the same local window across the spring change", () => {
      // Paris moves from CET (UTC+1) to CEST (UTC+2) on 2027-03-28, so 09:00 local moves from 08:00Z to 07:00Z.
      expect(
        run(
          ["2027-03-27T08:00:00.000Z", "2027-03-28T07:00:00.000Z", "2027-03-28T08:00:00.000Z"],
          { dateFrom: "2027-03-27", dateTo: "2027-03-28", timeWindows: [{ from: "09:00", to: "10:00" }] },
          "Europe/Paris"
        )
      ).toEqual(["2027-03-27T08:00:00.000Z", "2027-03-28T07:00:00.000Z"]);
    });
  });

  describe("slot hygiene", () => {
    it("skips away slots because the Booker does not offer them", () => {
      expect(
        run([
          { time: "2026-10-13T09:00:00.000Z", away: true, reason: "Vacation" },
          "2026-10-13T10:00:00.000Z",
        ])
      ).toEqual(["2026-10-13T10:00:00.000Z"]);
    });

    it("skips duplicate instants and unparseable times", () => {
      const slots: IGetAvailableSlots["slots"] = {
        "2026-10-13": [{ time: "2026-10-13T09:00:00.000Z" }, { time: "not a date" }],
        "2026-10-14": [{ time: "2026-10-13T09:00:00Z" }],
      };

      expect(filterSlots({ slots, filter: baseFilter, timeZone: "UTC" })).toEqual([
        "2026-10-13T09:00:00.000Z",
      ]);
    });

    it("returns the slot time strings exactly as the engine provided them", () => {
      expect(run(["2026-10-13T09:00:00Z"])).toEqual(["2026-10-13T09:00:00Z"]);
    });

    it("throws a bad request error for an invalid timezone", () => {
      expect(() => run(["2026-10-13T09:00:00.000Z"], {}, "Mars/Olympus_Mons")).toThrow(ErrorWithCode);
    });
  });

  describe("ordering and limits", () => {
    const sameDaySlots = [
      "2026-10-13T14:00:00.000Z",
      "2026-10-13T09:00:00.000Z",
      "2026-10-13T12:00:00.000Z",
      "2026-10-13T10:00:00.000Z",
      "2026-10-13T13:00:00.000Z",
      "2026-10-13T11:00:00.000Z",
    ];

    it("returns the three earliest slots in chronological order", () => {
      expect(run(sameDaySlots, { preference: "earliest" })).toEqual([
        "2026-10-13T09:00:00.000Z",
        "2026-10-13T10:00:00.000Z",
        "2026-10-13T11:00:00.000Z",
      ]);
    });

    it("returns the three latest slots, latest first", () => {
      expect(run(sameDaySlots, { preference: "latest" })).toEqual([
        "2026-10-13T14:00:00.000Z",
        "2026-10-13T13:00:00.000Z",
        "2026-10-13T12:00:00.000Z",
      ]);
    });

    it("spreads suggestions across the first, middle and last available days", () => {
      const slots = ["12", "13", "14", "15", "16"].flatMap((day) => [
        `2026-10-${day}T09:00:00.000Z`,
        `2026-10-${day}T15:00:00.000Z`,
      ]);

      expect(run(slots, { preference: "spread" })).toEqual([
        "2026-10-12T09:00:00.000Z",
        "2026-10-14T09:00:00.000Z",
        "2026-10-16T09:00:00.000Z",
      ]);
    });

    it("fills a spread with the earliest remaining slots when there are fewer days than suggestions", () => {
      expect(
        run(
          [
            "2026-10-12T11:00:00.000Z",
            "2026-10-12T10:00:00.000Z",
            "2026-10-12T09:00:00.000Z",
            "2026-10-13T09:00:00.000Z",
          ],
          { preference: "spread" }
        )
      ).toEqual(["2026-10-12T09:00:00.000Z", "2026-10-12T10:00:00.000Z", "2026-10-13T09:00:00.000Z"]);
    });

    it.each([
      "earliest",
      "latest",
      "spread",
    ] as const)("returns fewer than three when fewer slots match (%s)", (preference) => {
      expect(run(["2026-10-13T09:00:00.000Z", "2026-10-14T09:00:00.000Z"], { preference })).toHaveLength(2);
    });

    it.each([
      "earliest",
      "latest",
      "spread",
    ] as const)("returns an empty list when nothing matches (%s)", (preference) => {
      expect(run(["2026-10-20T09:00:00.000Z"], { preference })).toEqual([]);
      expect(filterSlots({ slots: {}, filter: { ...baseFilter, preference }, timeZone: "UTC" })).toEqual([]);
    });
  });
});
