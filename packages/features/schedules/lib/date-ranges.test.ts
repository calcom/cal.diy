import { describe, expect, it, vi } from "vitest";

import dayjs from "@calcom/dayjs";

import {
  buildDateRanges,
  intersect,
  processDateOverride,
  processWorkingHours,
  subtract,
} from "./date-ranges";

describe("processWorkingHours", () => {
  // TEMPORAIRLY SKIPPING THIS TEST - Started failing after 29th Oct
  it.skip("should return the correct working hours given a specific availability, timezone, and date range", () => {
    const item = {
      days: [1, 2, 3, 4, 5], // Monday to Friday
      startTime: new Date(Date.UTC(2023, 5, 12, 8, 0)), // 8 AM
      endTime: new Date(Date.UTC(2023, 5, 12, 17, 0)), // 5 PM
    };

    const timeZone = "America/New_York";
    const dateFrom = dayjs.utc().startOf("day").day(2).add(1, "week");
    const dateTo = dayjs.utc().endOf("day").day(3).add(1, "week");

    const indexedResults = processWorkingHours({}, { item, timeZone, dateFrom, dateTo, travelSchedules: [] });
    const results = Object.values(indexedResults);
    expect(results.length).toBe(2); // There should be two working days between the range
    // "America/New_York" day shifts -1, so we need to add a day to correct this shift.
    expect(results[0]).toEqual({
      start: dayjs(`${dateFrom.tz(timeZone).add(1, "day").format("YYYY-MM-DD")}T12:00:00Z`).tz(timeZone),
      end: dayjs(`${dateFrom.tz(timeZone).add(1, "day").format("YYYY-MM-DD")}T21:00:00Z`).tz(timeZone),
    });
    expect(results[1]).toEqual({
      start: dayjs(`${dateTo.tz(timeZone).format("YYYY-MM-DD")}T12:00:00Z`).tz(timeZone),
      end: dayjs(`${dateTo.tz(timeZone).format("YYYY-MM-DD")}T21:00:00Z`).tz(timeZone),
    });
  });
  it("should have availability on last day of month in the month were DST starts", () => {
    const item = {
      days: [0, 1, 2, 3, 4, 5, 6], // Monday to Sunday
      startTime: new Date(Date.UTC(2023, 5, 12, 8, 0)), // 8 AM
      endTime: new Date(Date.UTC(2023, 5, 12, 17, 0)), // 5 PM
    };

    const timeZone = "Europe/London";

    const dateFrom = dayjs().month(9).date(24); // starts before DST change
    const dateTo = dayjs().startOf("day").month(10).date(1); // first day of November

    const results = Object.values(
      processWorkingHours({}, { item, timeZone, dateFrom, dateTo, travelSchedules: [] })
    );

    const lastAvailableSlot = results[results.length - 1];

    expect(lastAvailableSlot.start.date()).toBe(31);
  });

  it("It has the correct working hours on date of DST change (- tz)", () => {
    vi.useFakeTimers().setSystemTime(new Date("2023-11-05T13:26:14.000Z"));

    const item = {
      days: [1, 2, 3, 4, 5],
      startTime: new Date(Date.UTC(2023, 5, 12, 9, 0)), // 9 AM
      endTime: new Date(Date.UTC(2023, 5, 12, 17, 0)), // 5 PM
    };

    const timeZone = "America/New_York";

    const dateFrom = dayjs();
    const dateTo = dayjs().endOf("month");

    const results = Object.values(
      processWorkingHours({}, { item, timeZone, dateFrom, dateTo, travelSchedules: [] })
    );

    expect(results).toStrictEqual([
      {
        start: dayjs("2023-11-06T14:00:00.000Z").tz(timeZone),
        end: dayjs("2023-11-06T22:00:00.000Z").tz(timeZone),
      },
      {
        start: dayjs("2023-11-07T14:00:00.000Z").tz(timeZone),
        end: dayjs("2023-11-07T22:00:00.000Z").tz(timeZone),
      },
      {
        start: dayjs("2023-11-08T14:00:00.000Z").tz(timeZone),
        end: dayjs("2023-11-08T22:00:00.000Z").tz(timeZone),
      },
      {
        start: dayjs("2023-11-09T14:00:00.000Z").tz(timeZone),
        end: dayjs("2023-11-09T22:00:00.000Z").tz(timeZone),
      },
      {
        start: dayjs("2023-11-10T14:00:00.000Z").tz(timeZone),
        end: dayjs("2023-11-10T22:00:00.000Z").tz(timeZone),
      },
      {
        start: dayjs("2023-11-13T14:00:00.000Z").tz(timeZone),
        end: dayjs("2023-11-13T22:00:00.000Z").tz(timeZone),
      },
      {
        start: dayjs("2023-11-14T14:00:00.000Z").tz(timeZone),
        end: dayjs("2023-11-14T22:00:00.000Z").tz(timeZone),
      },
      {
        start: dayjs("2023-11-15T14:00:00.000Z").tz(timeZone),
        end: dayjs("2023-11-15T22:00:00.000Z").tz(timeZone),
      },
      {
        start: dayjs("2023-11-16T14:00:00.000Z").tz(timeZone),
        end: dayjs("2023-11-16T22:00:00.000Z").tz(timeZone),
      },
      {
        start: dayjs("2023-11-17T14:00:00.000Z").tz(timeZone),
        end: dayjs("2023-11-17T22:00:00.000Z").tz(timeZone),
      },
      {
        start: dayjs("2023-11-20T14:00:00.000Z").tz(timeZone),
        end: dayjs("2023-11-20T22:00:00.000Z").tz(timeZone),
      },
      {
        start: dayjs("2023-11-21T14:00:00.000Z").tz(timeZone),
        end: dayjs("2023-11-21T22:00:00.000Z").tz(timeZone),
      },
      {
        start: dayjs("2023-11-22T14:00:00.000Z").tz(timeZone),
        end: dayjs("2023-11-22T22:00:00.000Z").tz(timeZone),
      },
      {
        start: dayjs("2023-11-23T14:00:00.000Z").tz(timeZone),
        end: dayjs("2023-11-23T22:00:00.000Z").tz(timeZone),
      },
      {
        start: dayjs("2023-11-24T14:00:00.000Z").tz(timeZone),
        end: dayjs("2023-11-24T22:00:00.000Z").tz(timeZone),
      },
      {
        start: dayjs("2023-11-27T14:00:00.000Z").tz(timeZone),
        end: dayjs("2023-11-27T22:00:00.000Z").tz(timeZone),
      },
      {
        start: dayjs("2023-11-28T14:00:00.000Z").tz(timeZone),
        end: dayjs("2023-11-28T22:00:00.000Z").tz(timeZone),
      },
      {
        start: dayjs("2023-11-29T14:00:00.000Z").tz(timeZone),
        end: dayjs("2023-11-29T22:00:00.000Z").tz(timeZone),
      },
      {
        start: dayjs("2023-11-30T14:00:00.000Z").tz(timeZone),
        end: dayjs("2023-11-30T22:00:00.000Z").tz(timeZone),
      },
    ]);

    vi.setSystemTime(vi.getRealSystemTime());
    vi.useRealTimers();
  });

  it("should return correct working hours with afternoon start time on DST spring-forward date", () => {
    // 2026-03-08 is when US spring forward happens (America/New_York)
    vi.useFakeTimers().setSystemTime(new Date("2026-03-07T12:00:00.000Z"));

    const item = {
      days: [0, 1, 2, 3, 4, 5, 6], // Sunday
      startTime: new Date(Date.UTC(2023, 5, 12, 13, 0)), // 1 PM
      endTime: new Date(Date.UTC(2023, 5, 12, 18, 0)), // 6 PM
    };

    const timeZone = "America/New_York";

    const dateFrom = dayjs();
    const dateTo = dayjs().add(2, "day");

    const results = Object.values(
      processWorkingHours({}, { item, timeZone, dateFrom, dateTo, travelSchedules: [] })
    );

    // On DST transition date (2026-03-08), 1 PM - 6 PM America/New_York is:
    // - Before transition (EST, UTC-5): 18:00 → 23:00 UTC
    // - On transition day (EDT, UTC-4): 17:00 → 22:00 UTC
    // The result should have correct UTC times for each day
    const march8Result = results.find((r) => r.start.format("YYYY-MM-DD") === "2026-03-08");
    expect(march8Result).toBeDefined();
    expect(march8Result!.start.utc().hour()).toBe(17); // 1 PM EDT = 5 PM UTC
    expect(march8Result!.end.utc().hour()).toBe(22); // 6 PM EDT = 10 PM UTC

    vi.setSystemTime(vi.getRealSystemTime());
    vi.useRealTimers();
  });

  it("should return correct working hours with afternoon start time on DST fall-back date", () => {
    // 2026-11-01 is when US fall back happens (America/New_York)
    vi.useFakeTimers().setSystemTime(new Date("2026-10-31T12:00:00.000Z"));

    const item = {
      days: [0, 1, 2, 3, 4, 5, 6], // Sunday
      startTime: new Date(Date.UTC(2023, 5, 12, 13, 0)), // 1 PM
      endTime: new Date(Date.UTC(2023, 5, 12, 18, 0)), // 6 PM
    };

    const timeZone = "America/New_York";

    const dateFrom = dayjs();
    const dateTo = dayjs().add(2, "day");

    const results = Object.values(
      processWorkingHours({}, { item, timeZone, dateFrom, dateTo, travelSchedules: [] })
    );

    // On DST transition date (2026-11-01), 1 PM - 6 PM America/New_York is:
    // - Before transition (EDT, UTC-4): 17:00 → 22:00 UTC
    // - On transition day (EST, UTC-5): 18:00 → 23:00 UTC
    const november1Result = results.find((r) => r.start.format("YYYY-MM-DD") === "2026-11-01");
    expect(november1Result).toBeDefined();
    expect(november1Result!.start.utc().hour()).toBe(18); // 1 PM EST = 6 PM UTC
    expect(november1Result!.end.utc().hour()).toBe(23); // 6 PM EST = 11 PM UTC

    vi.setSystemTime(vi.getRealSystemTime());
    vi.useRealTimers();
  });

  // TEMPORAIRLY SKIPPING THIS TEST - Started failing after 29th Oct
  it.skip("should return the correct working hours in the month were DST ends", () => {
    const item = {
      days: [0, 1, 2, 3, 4, 5, 6], // Monday to Sunday
      startTime: new Date(Date.UTC(2023, 5, 12, 8, 0)), // 8 AM
      endTime: new Date(Date.UTC(2023, 5, 12, 17, 0)), // 5 PM
    };

    // in America/New_York DST ends on first Sunday of November
    const timeZone = "America/New_York";

    let firstSundayOfNovember = dayjs().startOf("day").month(10).date(1);
    while (firstSundayOfNovember.day() !== 0) {
      firstSundayOfNovember = firstSundayOfNovember.add(1, "day");
    }

    const dateFrom = dayjs().month(10).date(1).startOf("day");
    const dateTo = dayjs().month(10).endOf("month");

    const results = Object.values(
      processWorkingHours({}, { item, timeZone, dateFrom, dateTo, travelSchedules: [] })
    );

    const allDSTStartAt12 = results
      .filter((res) => res.start.isBefore(firstSundayOfNovember))
      .every((result) => result.start.utc().hour() === 12);
    const allNotDSTStartAt13 = results
      .filter((res) => res.start.isAfter(firstSundayOfNovember))
      .every((result) => result.start.utc().hour() === 13);

    expect(allDSTStartAt12).toBeTruthy();
    expect(allNotDSTStartAt13).toBeTruthy();
  });

  it("should skip event if it ends before it starts (different days)", () => {
    const item = {
      days: [1, 2, 3],
      startTime: new Date(new Date().setUTCHours(8, 0, 0, 0)), // 8 AM
      endTime: new Date(new Date().setUTCHours(7, 0, 0, 0)), // 7 AM
    };

    const timeZone = "America/New_York";
    const dateFrom = dayjs("2023-11-07T00:00:00Z").tz(timeZone); // 2023-11-07T00:00:00 (America/New_York)
    const dateTo = dayjs("2023-11-08T00:00:00Z").tz(timeZone); // 2023-11-08T00:00:00 (America/New_York)

    const results = Object.values(
      processWorkingHours({}, { item, timeZone, dateFrom, dateTo, travelSchedules: [] })
    );

    expect(results).toEqual([]);
  });

  it("should skip event if it ends before it starts (same day but different hours)", () => {
    const item = {
      days: [1],
      startTime: new Date(new Date().setUTCHours(8, 0, 0, 0)), // 8 AM
      endTime: new Date(new Date().setUTCHours(7, 0, 0, 0)), // 7 AM
    };

    const timeZone = "America/New_York";
    const dateFrom = dayjs("2023-11-07T00:00:00Z").tz(timeZone); // 2023-11-07T00:00:00 (America/New_York)
    const dateTo = dayjs("2023-11-07T23:59:59Z").tz(timeZone); // 2023-11-07T23:59:59 (America/New_York)

    const results = Object.values(
      processWorkingHours({}, { item, timeZone, dateFrom, dateTo, travelSchedules: [] })
    );

    expect(results).toEqual([]);
  });

  it("should show working hours in correct timezone with existing travel schedules", () => {
    vi.useFakeTimers().setSystemTime(new Date("2023-01-01T00:00:00.000Z"));

    const item = {
      days: [0, 1, 2, 3, 4, 5, 6], // Monday to Sunday
      startTime: new Date(Date.UTC(2023, 5, 12, 8, 0)), // 8 AM
      endTime: new Date(Date.UTC(2023, 5, 12, 17, 0)), // 5 PM
    };

    const timeZone = "Europe/Berlin";

    const dateFrom = dayjs().startOf("day");
    const dateTo = dayjs().add(1, "week").startOf("day");

    const travelSchedules = [
      {
        startDate: dayjs().add(2, "day").startOf("day"),
        endDate: dayjs().add(3, "day").endOf("day"),
        timeZone: "America/New_York",
      },
      {
        startDate: dayjs().add(5, "day").startOf("day"),
        timeZone: "Asia/Kolkata",
      },
    ];

    const resultsWithTravelSchedule = Object.values(
      processWorkingHours(
        {},
        {
          item,
          timeZone,
          dateFrom,
          dateTo,
          travelSchedules,
        }
      )
    );

    const resultWithOriginalTz = resultsWithTravelSchedule.filter((result) => {
      return (
        result.start.isBefore(travelSchedules[0].startDate) ||
        (result.start.isAfter(travelSchedules[0].endDate) &&
          result.start.isBefore(travelSchedules[1].startDate))
      );
    });

    const resultsWithNewYorkTz = resultsWithTravelSchedule.filter(
      (result) =>
        !result.start.isBefore(travelSchedules[0].startDate) &&
        !result.start.isAfter(travelSchedules[0].endDate)
    );
    const resultsWithKolkataTz = resultsWithTravelSchedule.filter(
      (result) => !result.start.isBefore(travelSchedules[1].startDate)
    );

    // 8AM in Europe/Berlin is 7AM in UTC, 5PM in Europe/Berlin is 4PM in UTC
    expect(
      resultWithOriginalTz.every(
        (result) => result.start.utc().hour() === 7 && result.end.utc().hour() === 16
      )
    ).toBeTruthy();

    // 8AM in America/New_York is 1PM in UTC, 5PM in America/New_York is 10PM in UTC
    expect(
      resultsWithNewYorkTz.every((result) => {
        return result.start.utc().hour() === 13 && result.end.utc().hour() === 22;
      })
    ).toBeTruthy();

    // 8AM in Asia/Kolkata is 2:30AM in UTC, 5PM in Asia/Kolkata is 11:30AM in UTC
    expect(
      resultsWithKolkataTz.every((result) => {
        const correctStartTime = result.start.utc().hour() === 2 && result.start.utc().minute() === 30;
        const correctEndTime = result.end.utc().hour() === 11 && result.end.utc().minute() === 30;
        return correctStartTime && correctEndTime;
      })
    ).toBeTruthy();
  });
});

describe("processDateOverrides", () => {
  it("should return the correct date override given a specific availability, timezone, and date", () => {
    const item = {
      date: new Date(Date.UTC(2023, 5, 12, 8, 0)),
      startTime: new Date(Date.UTC(2023, 5, 12, 8, 0)), // 8 AM
      endTime: new Date(Date.UTC(2023, 5, 12, 17, 0)), // 5 PM
    };

    // 2023-06-12T20:00:00-04:00 (America/New_York)
    const timeZone = "America/New_York";

    const result = processDateOverride({
      item,
      itemDateAsUtc: dayjs.utc(item.date),
      timeZone,
      travelSchedules: [],
    });

    expect(result.start.format()).toEqual(dayjs("2023-06-12T12:00:00Z").tz(timeZone).format());
    expect(result.end.format()).toEqual(dayjs("2023-06-12T21:00:00Z").tz(timeZone).format());
  });
  it("should show date overrides in correct timezone with existing travel schedules", () => {
    const item = {
      date: new Date(Date.UTC(2023, 5, 12, 8, 0)),
      startTime: new Date(Date.UTC(2023, 5, 12, 8, 0)), // 8 AM
      endTime: new Date(Date.UTC(2023, 5, 12, 17, 0)), // 5 PM
    };

    // 2023-06-12T20:00:00-04:00 (America/New_York)
    const timeZone = "America/New_York";

    const travelScheduleTz = "Europe/Berlin";

    const travelSchedules = [
      {
        startDate: dayjs(new Date(Date.UTC(2023, 5, 11, 8, 0))).startOf("day"),
        endDate: dayjs(new Date(Date.UTC(2023, 5, 15, 8, 0))).endOf("day"),
        timeZone: travelScheduleTz,
      },
    ];

    const result = processDateOverride({
      item,
      itemDateAsUtc: dayjs.utc(item.date),
      timeZone,
      travelSchedules: travelSchedules,
    });

    expect(result.start.format()).toEqual(dayjs("2023-06-12T06:00:00Z").tz(travelScheduleTz).format());
    expect(result.end.format()).toEqual(dayjs("2023-06-12T15:00:00Z").tz(travelScheduleTz).format());
  });
});

describe("buildDateRanges", () => {
  it("should return the correct date ranges", () => {
    const items = [
      {
        date: new Date(Date.UTC(2023, 5, 13)),
        startTime: new Date(Date.UTC(0, 0, 0, 10, 0)), // 10 AM
        endTime: new Date(Date.UTC(0, 0, 0, 15, 0)), // 3 PM
      },
      {
        days: [1, 2, 3, 4, 5],
        startTime: new Date(Date.UTC(2023, 5, 12, 8, 0)), // 8 AM
        endTime: new Date(Date.UTC(2023, 5, 12, 17, 0)), // 5 PM
      },
    ];

    const dateFrom = dayjs("2023-06-13T00:00:00Z"); // 2023-06-12T20:00:00-04:00 (America/New_York)
    const dateTo = dayjs("2023-06-15T00:00:00Z");

    const timeZone = "America/New_York";

    const { dateRanges: results } = buildDateRanges({
      availability: items,
      timeZone,
      dateFrom,
      dateTo,
      travelSchedules: [],
    });
    // [
    //  { s: '2023-06-13T10:00:00-04:00', e: '2023-06-13T15:00:00-04:00' },
    //  { s: '2023-06-14T08:00:00-04:00', e: '2023-06-14T17:00:00-04:00' }
    // ]

    expect(results.length).toBe(2);

    expect(results[0]).toEqual({
      start: dayjs("2023-06-13T14:00:00Z").tz(timeZone),
      end: dayjs("2023-06-13T19:00:00Z").tz(timeZone),
    });

    expect(results[1]).toEqual({
      start: dayjs("2023-06-14T12:00:00Z").tz(timeZone),
      end: dayjs("2023-06-14T21:00:00Z").tz(timeZone),
    });
  });
  it("should handle day shifts correctly", () => {
    const item = [
      {
        date: new Date(Date.UTC(2023, 7, 15)),
        startTime: new Date(Date.UTC(2023, 5, 12, 9, 0)), // 9 AM
        endTime: new Date(Date.UTC(2023, 5, 12, 17, 0)), // 5 PM
      },
      {
        date: new Date(Date.UTC(2023, 7, 15)),
        startTime: new Date(Date.UTC(2023, 5, 12, 19, 0)), // 7 PM
        endTime: new Date(Date.UTC(2023, 5, 12, 21, 0)), // 9 PM
      },
    ];

    const timeZone = "Pacific/Honolulu";

    const dateFrom = dayjs.tz("2023-08-15", "Europe/Brussels").startOf("day");
    const dateTo = dayjs.tz("2023-08-15", "Europe/Brussels").endOf("day");
    //add tarvelScheduels

    const { dateRanges: result } = buildDateRanges({
      availability: item,
      timeZone,
      dateFrom,
      dateTo,
      travelSchedules: [],
    });
    // this happened only on Europe/Brussels, Europe/Amsterdam was 2023-08-15T17:00:00-10:00 (as it should be)
    expect(result[0].end.format()).not.toBe("2023-08-14T17:00:00-10:00");
  });
  it("should return correct date ranges with full day unavailable date override", () => {
    const items = [
      {
        date: new Date(Date.UTC(2023, 5, 13)),
        startTime: new Date(Date.UTC(0, 0, 0, 0, 0)),
        endTime: new Date(Date.UTC(0, 0, 0, 0, 0)),
      },
      {
        days: [1, 2, 3, 4, 5],
        startTime: new Date(Date.UTC(2023, 5, 12, 8, 0)),
        endTime: new Date(Date.UTC(2023, 5, 12, 17, 0)),
      },
    ];
    const timeZone = "Europe/London";

    const dateFrom = dayjs("2023-06-13T00:00:00Z");
    const dateTo = dayjs("2023-06-15T00:00:00Z");
    //add tarvelScheduels

    const { dateRanges: results } = buildDateRanges({
      availability: items,
      timeZone,
      dateFrom,
      dateTo,
      travelSchedules: [],
    });

    expect(results[0]).toEqual({
      start: dayjs("2023-06-14T07:00:00Z").tz(timeZone),
      end: dayjs("2023-06-14T16:00:00Z").tz(timeZone),
    });
  });
  it("should return correct date ranges for specific time slot in date override", () => {
    const items = [
      {
        date: new Date(Date.UTC(2023, 5, 13)),
        startTime: new Date(Date.UTC(0, 0, 0, 9, 0)),
        endTime: new Date(Date.UTC(0, 0, 0, 14, 0)),
      },
    ];
    const timeZone = "Europe/London";

    const dateFrom = dayjs("2023-06-13T10:00:00Z");
    const dateTo = dayjs("2023-06-13T10:30:00Z");
    //add tarvelScheduels

    const { dateRanges: results } = buildDateRanges({
      availability: items,
      timeZone,
      dateFrom,
      dateTo,
      travelSchedules: [],
    });

    expect(results[0]).toEqual({
      start: dayjs("2023-06-13T08:00:00Z").tz(timeZone),
      end: dayjs("2023-06-13T13:00:00Z").tz(timeZone),
    });
  });
  it("should return correct date ranges if date override would already already be the next day in utc timezone", () => {
    const items = [
      {
        date: new Date(Date.UTC(2023, 5, 13)),
        startTime: new Date(Date.UTC(0, 0, 0, 22, 0)),
        endTime: new Date(Date.UTC(0, 0, 0, 23, 0)),
      },
      {
        days: [1, 2, 3, 4, 5],
        startTime: new Date(Date.UTC(2023, 5, 12, 8, 0)),
        endTime: new Date(Date.UTC(2023, 5, 12, 17, 0)),
      },
    ];
    const timeZone = "America/New_York";

    const dateFrom = dayjs("2023-06-13T00:00:00Z");
    const dateTo = dayjs("2023-06-15T00:00:00Z");
    //add tarvelScheduels

    const { dateRanges: results } = buildDateRanges({
      availability: items,
      timeZone,
      dateFrom,
      dateTo,
      travelSchedules: [],
    });

    expect(results[0]).toEqual({
      start: dayjs("2023-06-14T02:00:00Z").tz(timeZone),
      end: dayjs("2023-06-14T03:00:00Z").tz(timeZone),
    });
    expect(results[1]).toEqual({
      start: dayjs("2023-06-14T12:00:00Z").tz(timeZone),
      end: dayjs("2023-06-14T21:00:00Z").tz(timeZone),
    });
  });
  it("should handle OOO correctly", () => {
    const items = [
      {
        date: new Date(Date.UTC(2023, 5, 13)),
        startTime: new Date(Date.UTC(0, 0, 0, 10, 0)), // 10 AM
        endTime: new Date(Date.UTC(0, 0, 0, 15, 0)), // 3 PM
      },
      {
        days: [1, 2, 3, 4, 5],
        startTime: new Date(Date.UTC(2023, 5, 12, 8, 0)), // 8 AM
        endTime: new Date(Date.UTC(2023, 5, 12, 17, 0)), // 5 PM
      },
    ];

    const outOfOffice = {
      "2023-06-13": {
        fromUser: { id: 1, displayName: "Team Free Example" },
      },
    };

    const dateFrom = dayjs("2023-06-13T00:00:00Z"); // 2023-06-12T20:00:00-04:00 (America/New_York)
    const dateTo = dayjs("2023-06-15T00:00:00Z");

    const timeZone = "America/New_York";

    const { dateRanges, oooExcludedDateRanges } = buildDateRanges({
      availability: items,
      timeZone,
      dateFrom,
      dateTo,
      travelSchedules: [],
      outOfOffice,
    });

    expect(dateRanges[0]).toEqual({
      start: dayjs.utc("2023-06-13T14:00:00Z").tz(timeZone),
      end: dayjs.utc("2023-06-13T19:00:00Z").tz(timeZone),
    });

    expect(dateRanges[1]).toEqual({
      start: dayjs.utc("2023-06-14T12:00:00Z").tz(timeZone),
      end: dayjs.utc("2023-06-14T21:00:00Z").tz(timeZone),
    });
    expect(oooExcludedDateRanges.length).toBe(1);
    expect(oooExcludedDateRanges[0]).toEqual({
      start: dayjs("2023-06-14T12:00:00Z").tz(timeZone),
      end: dayjs("2023-06-14T21:00:00Z").tz(timeZone),
    });
  });
  it("supports availability past midnight through merging adjacent date ranges", () => {
    // tests a 90 minute slot remains available
    const items = [
      {
        days: [1, 2, 3, 4, 5],
        startTime: new Date(Date.UTC(0, 0, 0, 23, 0)), // 11 PM
        endTime: new Date(Date.UTC(0, 0, 0, 23, 59)), // 11:59 PM (EOD)
      },
      {
        days: [2, 3, 4, 5, 6],
        startTime: new Date(Date.UTC(0, 0, 0, 0, 0)), // 12 AM
        endTime: new Date(Date.UTC(0, 0, 0, 0, 30)), // 12:30 AM
      },
    ];

    const dateFrom = dayjs("2023-06-13T00:00:00Z"); // 2023-06-12T20:00:00-04:00 (America/New_York)
    const dateTo = dayjs("2023-06-15T00:00:00Z");

    const timeZone = "Europe/London";

    const { dateRanges: results } = buildDateRanges({
      availability: items,
      timeZone,
      dateFrom,
      dateTo,
      travelSchedules: [],
    });

    expect(results.length).toBe(2);

    expect(results[0]).toEqual({
      start: dayjs.utc("2023-06-13T22:00:00Z").tz(timeZone),
      end: dayjs.utc("2023-06-13T23:30:00Z").tz(timeZone),
    });

    expect(results[1]).toEqual({
      start: dayjs("2023-06-14T22:00:00Z").tz(timeZone),
      end: dayjs("2023-06-14T23:30:00Z").tz(timeZone),
    });
  });
  it("supports multi-day availability past midnight through merging adjacent date ranges", () => {
    // tests a 2 day date range remains available
    const items = [
      {
        days: [1, 2],
        startTime: new Date(Date.UTC(0, 0, 0, 0, 0)), // 12 AM
        endTime: new Date(Date.UTC(0, 0, 0, 23, 59)), // 11:59 PM (EOD)
      },
    ];

    const dateFrom = dayjs("2023-06-11T00:00:00Z"); // 2023-06-12T20:00:00-04:00 (America/New_York)
    const dateTo = dayjs("2023-06-14T00:00:00Z");

    const timeZone = "Europe/London";

    const { dateRanges: results } = buildDateRanges({
      availability: items,
      timeZone,
      dateFrom,
      dateTo,
      travelSchedules: [],
    });

    expect(results.length).toBe(1);

    expect(results[0]).toEqual({
      start: dayjs.utc("2023-06-11T23:00:00Z").tz(timeZone),
      end: dayjs.utc("2023-06-13T23:00:00Z").tz(timeZone),
    });
  });
  it("supports multi-day availability past midnight through merging adjacent date ranges (date overrides)", () => {
    // tests a 2 day date range remains available
    const items = [
      {
        date: new Date("2023-06-12T00:00:00Z"),
        startTime: new Date(Date.UTC(0, 0, 0, 0, 0)), // 11 PM
        endTime: new Date(Date.UTC(0, 0, 0, 23, 59)), // 11:59 PM (EOD)
      },
      {
        date: new Date("2023-06-13T00:00:00Z"),
        startTime: new Date(Date.UTC(0, 0, 0, 0, 0)), // 11 PM
        endTime: new Date(Date.UTC(0, 0, 0, 23, 59)), // 11:59 PM (EOD)
      },
    ];

    const dateFrom = dayjs("2023-06-11T00:00:00Z"); // 2023-06-12T20:00:00-04:00 (America/New_York)
    const dateTo = dayjs("2023-06-14T00:00:00Z");

    const timeZone = "Europe/London";

    const { dateRanges: results } = buildDateRanges({
      availability: items,
      timeZone,
      dateFrom,
      dateTo,
      travelSchedules: [],
    });

    expect(results.length).toBe(1);

    expect(results[0]).toEqual({
      start: dayjs.utc("2023-06-11T23:00:00Z").tz(timeZone),
      end: dayjs.utc("2023-06-13T23:00:00Z").tz(timeZone),
    });
  });
  it("should not lose earlier time slots when overlapping ranges have the same end time", () => {
    const items = [
      {
        days: [1],
        startTime: new Date(Date.UTC(0, 0, 0, 6, 0)),
        endTime: new Date(Date.UTC(0, 0, 0, 10, 0)),
      },
      {
        days: [1],
        startTime: new Date(Date.UTC(0, 0, 0, 8, 0)),
        endTime: new Date(Date.UTC(0, 0, 0, 10, 0)),
      },
    ];

    const dateFrom = dayjs("2023-06-12T00:00:00Z");
    const dateTo = dayjs("2023-06-13T00:00:00Z");
    const timeZone = "UTC";

    const { dateRanges: results } = buildDateRanges({
      availability: items,
      timeZone,
      dateFrom,
      dateTo,
      travelSchedules: [],
    });

    expect(results.length).toBe(1);

    expect(results[0]).toEqual({
      start: dayjs.utc("2023-06-12T06:00:00Z").tz(timeZone),
      end: dayjs.utc("2023-06-12T10:00:00Z").tz(timeZone),
    });
  });
});

describe("subtract", () => {
  it("subtracts appropriately when excluded ranges are given in order", () => {
    const data = {
      sourceRanges: [
        { start: dayjs.utc("2023-07-05T04:00:00.000Z"), end: dayjs.utc("2023-07-05T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-06T04:00:00.000Z"), end: dayjs.utc("2023-07-06T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-07T04:00:00.000Z"), end: dayjs.utc("2023-07-07T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-10T04:00:00.000Z"), end: dayjs.utc("2023-07-10T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-11T04:00:00.000Z"), end: dayjs.utc("2023-07-11T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-12T04:00:00.000Z"), end: dayjs.utc("2023-07-12T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-13T04:00:00.000Z"), end: dayjs.utc("2023-07-13T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-14T04:00:00.000Z"), end: dayjs.utc("2023-07-14T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-17T04:00:00.000Z"), end: dayjs.utc("2023-07-17T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-18T04:00:00.000Z"), end: dayjs.utc("2023-07-18T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-19T04:00:00.000Z"), end: dayjs.utc("2023-07-19T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-20T04:00:00.000Z"), end: dayjs.utc("2023-07-20T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-21T04:00:00.000Z"), end: dayjs.utc("2023-07-21T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-24T04:00:00.000Z"), end: dayjs.utc("2023-07-24T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-25T04:00:00.000Z"), end: dayjs.utc("2023-07-25T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-26T04:00:00.000Z"), end: dayjs.utc("2023-07-26T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-27T04:00:00.000Z"), end: dayjs.utc("2023-07-27T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-28T04:00:00.000Z"), end: dayjs.utc("2023-07-28T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-31T04:00:00.000Z"), end: dayjs.utc("2023-07-31T12:00:00.000Z") },
      ],
      excludedRanges: [
        { start: dayjs.utc("2023-07-05T04:00:00.000Z"), end: dayjs.utc("2023-07-05T04:15:00.000Z") },
        { start: dayjs.utc("2023-07-05T04:45:00.000Z"), end: dayjs.utc("2023-07-05T05:00:00.000Z") },
      ],
    };

    const result = subtract(data["sourceRanges"], data["excludedRanges"]).map((range) => ({
      start: range.start.format(),
      end: range.end.format(),
    }));

    expect(result).toEqual(
      expect.arrayContaining([
        { start: "2023-07-05T04:15:00Z", end: "2023-07-05T04:45:00Z" },
        { start: "2023-07-05T05:00:00Z", end: "2023-07-05T12:00:00Z" },
      ])
    );
  });

  it("subtracts appropriately when excluded ranges are not given in order", () => {
    const data = {
      sourceRanges: [
        { start: dayjs.utc("2023-07-05T04:00:00.000Z"), end: dayjs.utc("2023-07-05T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-06T04:00:00.000Z"), end: dayjs.utc("2023-07-06T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-07T04:00:00.000Z"), end: dayjs.utc("2023-07-07T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-10T04:00:00.000Z"), end: dayjs.utc("2023-07-10T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-11T04:00:00.000Z"), end: dayjs.utc("2023-07-11T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-12T04:00:00.000Z"), end: dayjs.utc("2023-07-12T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-13T04:00:00.000Z"), end: dayjs.utc("2023-07-13T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-14T04:00:00.000Z"), end: dayjs.utc("2023-07-14T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-17T04:00:00.000Z"), end: dayjs.utc("2023-07-17T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-18T04:00:00.000Z"), end: dayjs.utc("2023-07-18T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-19T04:00:00.000Z"), end: dayjs.utc("2023-07-19T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-20T04:00:00.000Z"), end: dayjs.utc("2023-07-20T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-21T04:00:00.000Z"), end: dayjs.utc("2023-07-21T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-24T04:00:00.000Z"), end: dayjs.utc("2023-07-24T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-25T04:00:00.000Z"), end: dayjs.utc("2023-07-25T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-26T04:00:00.000Z"), end: dayjs.utc("2023-07-26T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-27T04:00:00.000Z"), end: dayjs.utc("2023-07-27T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-28T04:00:00.000Z"), end: dayjs.utc("2023-07-28T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-31T04:00:00.000Z"), end: dayjs.utc("2023-07-31T12:00:00.000Z") },
      ],
      excludedRanges: [
        { start: dayjs.utc("2023-07-05T04:45:00.000Z"), end: dayjs.utc("2023-07-05T05:00:00.000Z") },
        { start: dayjs.utc("2023-07-05T04:00:00.000Z"), end: dayjs.utc("2023-07-05T04:15:00.000Z") },
      ],
    };

    const result = subtract(data["sourceRanges"], data["excludedRanges"]).map((range) => ({
      start: range.start.format(),
      end: range.end.format(),
    }));

    expect(result).toEqual(
      expect.arrayContaining([
        { start: "2023-07-05T04:15:00Z", end: "2023-07-05T04:45:00Z" },
        { start: "2023-07-05T05:00:00Z", end: "2023-07-05T12:00:00Z" },
      ])
    );
  });
});

describe("intersect function comprehensive tests", () => {
  describe("empty and invalid inputs", () => {
    it("should handle empty array of ranges", () => {
      expect(intersect([])).toEqual([]);
    });

    it("should handle array with empty range arrays", () => {
      expect(intersect([[]])).toEqual([]);
      expect(intersect([[], []])).toEqual([]);
      expect(intersect([[], [], []])).toEqual([]);
    });

    it("should handle mixed empty and non-empty arrays", () => {
      const ranges = [{ start: dayjs("2023-06-01T09:00:00Z"), end: dayjs("2023-06-01T10:00:00Z") }];
      expect(intersect([ranges, []])).toEqual([]);
      expect(intersect([[], ranges])).toEqual([]);
      expect(intersect([ranges, [], ranges])).toEqual([]);
    });
  });

  describe("single array inputs", () => {
    it("should return the same ranges when only one array is provided", () => {
      const singleRange = [{ start: dayjs("2023-06-01T09:00:00Z"), end: dayjs("2023-06-01T10:00:00Z") }];
      expect(intersect([singleRange])).toEqual(singleRange);
    });

    it("should handle single array with multiple ranges", () => {
      const multipleRanges = [
        { start: dayjs("2023-06-01T09:00:00Z"), end: dayjs("2023-06-01T10:00:00Z") },
        { start: dayjs("2023-06-01T11:00:00Z"), end: dayjs("2023-06-01T12:00:00Z") },
      ];
      expect(intersect([multipleRanges])).toEqual(multipleRanges);
    });
  });

  describe("non-overlapping ranges", () => {
    it("should return empty array for completely separate ranges", () => {
      const ranges1 = [{ start: dayjs("2023-06-01T09:00:00Z"), end: dayjs("2023-06-01T10:00:00Z") }];
      const ranges2 = [{ start: dayjs("2023-06-01T11:00:00Z"), end: dayjs("2023-06-01T12:00:00Z") }];
      expect(intersect([ranges1, ranges2])).toEqual([]);
    });

    it("should return empty array for three non-overlapping ranges", () => {
      const ranges1 = [{ start: dayjs("2023-06-01T09:00:00Z"), end: dayjs("2023-06-01T10:00:00Z") }];
      const ranges2 = [{ start: dayjs("2023-06-01T11:00:00Z"), end: dayjs("2023-06-01T12:00:00Z") }];
      const ranges3 = [{ start: dayjs("2023-06-01T13:00:00Z"), end: dayjs("2023-06-01T14:00:00Z") }];
      expect(intersect([ranges1, ranges2, ranges3])).toEqual([]);
    });

    it("should handle ranges on different days", () => {
      const ranges1 = [{ start: dayjs("2023-06-01T09:00:00Z"), end: dayjs("2023-06-01T17:00:00Z") }];
      const ranges2 = [{ start: dayjs("2023-06-02T09:00:00Z"), end: dayjs("2023-06-02T17:00:00Z") }];
      expect(intersect([ranges1, ranges2])).toEqual([]);
    });
  });

  describe("touching ranges (no overlap)", () => {
    it("should return empty array for ranges that touch at endpoints", () => {
      const ranges1 = [{ start: dayjs("2023-06-01T09:00:00Z"), end: dayjs("2023-06-01T10:00:00Z") }];
      const ranges2 = [{ start: dayjs("2023-06-01T10:00:00Z"), end: dayjs("2023-06-01T11:00:00Z") }];
      expect(intersect([ranges1, ranges2])).toEqual([]);
    });

    it("should handle multiple touching ranges", () => {
      const ranges1 = [{ start: dayjs("2023-06-01T09:00:00Z"), end: dayjs("2023-06-01T10:00:00Z") }];
      const ranges2 = [{ start: dayjs("2023-06-01T10:00:00Z"), end: dayjs("2023-06-01T11:00:00Z") }];
      const ranges3 = [{ start: dayjs("2023-06-01T11:00:00Z"), end: dayjs("2023-06-01T12:00:00Z") }];
      expect(intersect([ranges1, ranges2, ranges3])).toEqual([]);
    });
  });

  describe("simple overlapping ranges", () => {
    it("should find intersection of two overlapping ranges", () => {
      const ranges1 = [{ start: dayjs("2023-06-01T09:00:00Z"), end: dayjs("2023-06-01T11:00:00Z") }];
      const ranges2 = [{ start: dayjs("2023-06-01T10:00:00Z"), end: dayjs("2023-06-01T12:00:00Z") }];
      const result = intersect([ranges1, ranges2]);

      expect(result).toHaveLength(1);
      expect(result[0].start.valueOf()).toBe(dayjs("2023-06-01T10:00:00Z").valueOf());
      expect(result[0].end.valueOf()).toBe(dayjs("2023-06-01T11:00:00Z").valueOf());
    });

    it("should handle partial overlap at the beginning", () => {
      const ranges1 = [{ start: dayjs("2023-06-01T08:00:00Z"), end: dayjs("2023-06-01T10:00:00Z") }];
      const ranges2 = [{ start: dayjs("2023-06-01T09:00:00Z"), end: dayjs("2023-06-01T11:00:00Z") }];
      const result = intersect([ranges1, ranges2]);

      expect(result).toHaveLength(1);
      expect(result[0].start.valueOf()).toBe(dayjs("2023-06-01T09:00:00Z").valueOf());
      expect(result[0].end.valueOf()).toBe(dayjs("2023-06-01T10:00:00Z").valueOf());
    });

    it("should handle partial overlap at the end", () => {
      const ranges1 = [{ start: dayjs("2023-06-01T10:00:00Z"), end: dayjs("2023-06-01T12:00:00Z") }];
      const ranges2 = [{ start: dayjs("2023-06-01T09:00:00Z"), end: dayjs("2023-06-01T11:00:00Z") }];
      const result = intersect([ranges1, ranges2]);

      expect(result).toHaveLength(1);
      expect(result[0].start.valueOf()).toBe(dayjs("2023-06-01T10:00:00Z").valueOf());
      expect(result[0].end.valueOf()).toBe(dayjs("2023-06-01T11:00:00Z").valueOf());
    });
  });

  describe("containment scenarios", () => {
    it("should handle complete containment", () => {
      const outer = [{ start: dayjs("2023-06-01T08:00:00Z"), end: dayjs("2023-06-01T12:00:00Z") }];
      const inner = [{ start: dayjs("2023-06-01T09:00:00Z"), end: dayjs("2023-06-01T11:00:00Z") }];
      const result = intersect([outer, inner]);

      expect(result).toHaveLength(1);
      expect(result[0].start.valueOf()).toBe(dayjs("2023-06-01T09:00:00Z").valueOf());
      expect(result[0].end.valueOf()).toBe(dayjs("2023-06-01T11:00:00Z").valueOf());
    });

    it("should handle reverse containment", () => {
      const inner = [{ start: dayjs("2023-06-01T09:00:00Z"), end: dayjs("2023-06-01T11:00:00Z") }];
      const outer = [{ start: dayjs("2023-06-01T08:00:00Z"), end: dayjs("2023-06-01T12:00:00Z") }];
      const result = intersect([inner, outer]);

      expect(result).toHaveLength(1);
      expect(result[0].start.valueOf()).toBe(dayjs("2023-06-01T09:00:00Z").valueOf());
      expect(result[0].end.valueOf()).toBe(dayjs("2023-06-01T11:00:00Z").valueOf());
    });
  });

  describe("identical ranges", () => {
    it("should handle identical single ranges", () => {
      const range1 = [{ start: dayjs("2023-06-01T09:00:00Z"), end: dayjs("2023-06-01T11:00:00Z") }];
      const range2 = [{ start: dayjs("2023-06-01T09:00:00Z"), end: dayjs("2023-06-01T11:00:00Z") }];
      const result = intersect([range1, range2]);

      expect(result).toHaveLength(1);
      expect(result[0].start.valueOf()).toBe(dayjs("2023-06-01T09:00:00Z").valueOf());
      expect(result[0].end.valueOf()).toBe(dayjs("2023-06-01T11:00:00Z").valueOf());
    });

    it("should handle identical multiple ranges", () => {
      const ranges1 = [
        { start: dayjs("2023-06-01T09:00:00Z"), end: dayjs("2023-06-01T10:00:00Z") },
        { start: dayjs("2023-06-01T11:00:00Z"), end: dayjs("2023-06-01T12:00:00Z") },
      ];
      const ranges2 = [
        { start: dayjs("2023-06-01T09:00:00Z"), end: dayjs("2023-06-01T10:00:00Z") },
        { start: dayjs("2023-06-01T11:00:00Z"), end: dayjs("2023-06-01T12:00:00Z") },
      ];
      const result = intersect([ranges1, ranges2]);

      expect(result).toHaveLength(2);
      expect(result[0].start.valueOf()).toBe(dayjs("2023-06-01T09:00:00Z").valueOf());
      expect(result[0].end.valueOf()).toBe(dayjs("2023-06-01T10:00:00Z").valueOf());
      expect(result[1].start.valueOf()).toBe(dayjs("2023-06-01T11:00:00Z").valueOf());
      expect(result[1].end.valueOf()).toBe(dayjs("2023-06-01T12:00:00Z").valueOf());
    });
  });

  describe("multiple ranges per array", () => {
    it("should handle multiple ranges in each array", () => {
      const ranges1 = [
        { start: dayjs("2023-06-01T09:00:00Z"), end: dayjs("2023-06-01T11:00:00Z") },
        { start: dayjs("2023-06-01T13:00:00Z"), end: dayjs("2023-06-01T15:00:00Z") },
      ];
      const ranges2 = [
        { start: dayjs("2023-06-01T10:00:00Z"), end: dayjs("2023-06-01T12:00:00Z") },
        { start: dayjs("2023-06-01T14:00:00Z"), end: dayjs("2023-06-01T16:00:00Z") },
      ];
      const result = intersect([ranges1, ranges2]);

      expect(result).toHaveLength(2);
      expect(result[0].start.valueOf()).toBe(dayjs("2023-06-01T10:00:00Z").valueOf());
      expect(result[0].end.valueOf()).toBe(dayjs("2023-06-01T11:00:00Z").valueOf());
      expect(result[1].start.valueOf()).toBe(dayjs("2023-06-01T14:00:00Z").valueOf());
      expect(result[1].end.valueOf()).toBe(dayjs("2023-06-01T15:00:00Z").valueOf());
    });

    it("should handle complex multiple range intersections", () => {
      const ranges1 = [
        { start: dayjs("2023-06-01T08:00:00Z"), end: dayjs("2023-06-01T12:00:00Z") },
        { start: dayjs("2023-06-01T14:00:00Z"), end: dayjs("2023-06-01T18:00:00Z") },
      ];
      const ranges2 = [
        { start: dayjs("2023-06-01T09:00:00Z"), end: dayjs("2023-06-01T10:00:00Z") },
        { start: dayjs("2023-06-01T11:00:00Z"), end: dayjs("2023-06-01T13:00:00Z") },
        { start: dayjs("2023-06-01T15:00:00Z"), end: dayjs("2023-06-01T17:00:00Z") },
      ];
      const result = intersect([ranges1, ranges2]);

      expect(result).toHaveLength(3);
      expect(result[0].start.valueOf()).toBe(dayjs("2023-06-01T09:00:00Z").valueOf());
      expect(result[0].end.valueOf()).toBe(dayjs("2023-06-01T10:00:00Z").valueOf());
      expect(result[1].start.valueOf()).toBe(dayjs("2023-06-01T11:00:00Z").valueOf());
      expect(result[1].end.valueOf()).toBe(dayjs("2023-06-01T12:00:00Z").valueOf());
      expect(result[2].start.valueOf()).toBe(dayjs("2023-06-01T15:00:00Z").valueOf());
      expect(result[2].end.valueOf()).toBe(dayjs("2023-06-01T17:00:00Z").valueOf());
    });
  });

  describe("unsorted input handling", () => {
    it("should handle unsorted ranges correctly", () => {
      const ranges1 = [
        { start: dayjs("2023-06-01T13:00:00Z"), end: dayjs("2023-06-01T15:00:00Z") },
        { start: dayjs("2023-06-01T09:00:00Z"), end: dayjs("2023-06-01T11:00:00Z") },
      ];
      const ranges2 = [
        { start: dayjs("2023-06-01T14:00:00Z"), end: dayjs("2023-06-01T16:00:00Z") },
        { start: dayjs("2023-06-01T10:00:00Z"), end: dayjs("2023-06-01T12:00:00Z") },
      ];
      const result = intersect([ranges1, ranges2]);

      expect(result).toHaveLength(2);
      const sortedResult = result.sort((a, b) => a.start.valueOf() - b.start.valueOf());
      expect(sortedResult[0].start.valueOf()).toBe(dayjs("2023-06-01T10:00:00Z").valueOf());
      expect(sortedResult[0].end.valueOf()).toBe(dayjs("2023-06-01T11:00:00Z").valueOf());
      expect(sortedResult[1].start.valueOf()).toBe(dayjs("2023-06-01T14:00:00Z").valueOf());
      expect(sortedResult[1].end.valueOf()).toBe(dayjs("2023-06-01T15:00:00Z").valueOf());
    });
  });

  describe("cross-day scenarios", () => {
    it("should handle ranges spanning multiple days", () => {
      const ranges1 = [{ start: dayjs("2023-06-01T22:00:00Z"), end: dayjs("2023-06-02T02:00:00Z") }];
      const ranges2 = [{ start: dayjs("2023-06-02T01:00:00Z"), end: dayjs("2023-06-02T05:00:00Z") }];
      const result = intersect([ranges1, ranges2]);

      expect(result).toHaveLength(1);
      expect(result[0].start.valueOf()).toBe(dayjs("2023-06-02T01:00:00Z").valueOf());
      expect(result[0].end.valueOf()).toBe(dayjs("2023-06-02T02:00:00Z").valueOf());
    });
  });

  describe("team scheduling scenarios", () => {
    it("should handle team scheduling scenario", () => {
      const user1Availability = [
        { start: dayjs("2023-06-01T09:00:00Z"), end: dayjs("2023-06-01T12:00:00Z") },
        { start: dayjs("2023-06-01T14:00:00Z"), end: dayjs("2023-06-01T17:00:00Z") },
      ];
      const user2Availability = [
        { start: dayjs("2023-06-01T10:00:00Z"), end: dayjs("2023-06-01T13:00:00Z") },
        { start: dayjs("2023-06-01T15:00:00Z"), end: dayjs("2023-06-01T18:00:00Z") },
      ];
      const user3Availability = [
        { start: dayjs("2023-06-01T11:00:00Z"), end: dayjs("2023-06-01T12:30:00Z") },
        { start: dayjs("2023-06-01T15:30:00Z"), end: dayjs("2023-06-01T16:30:00Z") },
      ];

      const result = intersect([user1Availability, user2Availability, user3Availability]);
      expect(result).toHaveLength(2);

      const sortedResult = result.sort((a, b) => a.start.valueOf() - b.start.valueOf());
      expect(sortedResult[0].start.valueOf()).toBe(dayjs("2023-06-01T11:00:00Z").valueOf());
      expect(sortedResult[0].end.valueOf()).toBe(dayjs("2023-06-01T12:00:00Z").valueOf());
      expect(sortedResult[1].start.valueOf()).toBe(dayjs("2023-06-01T15:30:00Z").valueOf());
      expect(sortedResult[1].end.valueOf()).toBe(dayjs("2023-06-01T16:30:00Z").valueOf());
    });

    it("should handle complex team scheduling with 4 users", () => {
      const user1Availability = [
        { start: dayjs("2023-06-01T09:00:00Z"), end: dayjs("2023-06-01T17:00:00Z") },
      ];
      const user2Availability = [
        { start: dayjs("2023-06-01T10:00:00Z"), end: dayjs("2023-06-01T16:00:00Z") },
      ];
      const user3Availability = [
        { start: dayjs("2023-06-01T11:00:00Z"), end: dayjs("2023-06-01T15:00:00Z") },
      ];
      const user4Availability = [
        { start: dayjs("2023-06-01T11:15:00Z"), end: dayjs("2023-06-01T11:30:00Z") },
        { start: dayjs("2023-06-01T13:00:00Z"), end: dayjs("2023-06-01T14:00:00Z") },
      ];

      const result = intersect([user1Availability, user2Availability, user3Availability, user4Availability]);
      expect(result).toHaveLength(2);

      const sortedResult = result.sort((a, b) => a.start.valueOf() - b.start.valueOf());
      expect(sortedResult[0].start.valueOf()).toBe(dayjs("2023-06-01T11:15:00Z").valueOf());
      expect(sortedResult[0].end.valueOf()).toBe(dayjs("2023-06-01T11:30:00Z").valueOf());
      expect(sortedResult[1].start.valueOf()).toBe(dayjs("2023-06-01T13:00:00Z").valueOf());
      expect(sortedResult[1].end.valueOf()).toBe(dayjs("2023-06-01T14:00:00Z").valueOf());
    });
  });

  describe("performance and stress testing", () => {
    it("should handle large datasets efficiently", () => {
      const createDateRanges = (count: number, startDate: string, userOffset: number) => {
        const ranges = [];
        const baseDate = dayjs(startDate);

        for (let i = 0; i < count; i++) {
          const start = baseDate.add(i * 2 + userOffset, "hour");
          const end = start.add(1, "hour");
          ranges.push({ start, end });
        }
        return ranges;
      };

      const commonAvailability = createDateRanges(100, "2023-06-01T09:00:00Z", 0);
      const userRanges1 = createDateRanges(100, "2023-06-01T10:00:00Z", 1);
      const userRanges2 = createDateRanges(100, "2023-06-01T11:00:00Z", 2);
      const userRanges3 = createDateRanges(100, "2023-06-01T12:00:00Z", 3);

      const startTime = performance.now();
      const result = intersect([commonAvailability, userRanges1, userRanges2, userRanges3]);
      const endTime = performance.now();
      const executionTime = endTime - startTime;

      expect(executionTime).toBeLessThan(100);
      expect(result.length).toBeGreaterThanOrEqual(0);

      result.forEach((intersection) => {
        expect(intersection.start).toBeDefined();
        expect(intersection.end).toBeDefined();
        expect(intersection.start.isBefore(intersection.end)).toBe(true);
      });
    });

    it("should handle time precision correctly", () => {
      const ranges1 = [{ start: dayjs("2023-06-01T09:00:00.000Z"), end: dayjs("2023-06-01T10:00:00.500Z") }];
      const ranges2 = [{ start: dayjs("2023-06-01T09:30:00.250Z"), end: dayjs("2023-06-01T11:00:00.750Z") }];
      const result = intersect([ranges1, ranges2]);

      expect(result).toHaveLength(1);
      expect(result[0].start.valueOf()).toBe(dayjs("2023-06-01T09:30:00.250Z").valueOf());
      expect(result[0].end.valueOf()).toBe(dayjs("2023-06-01T10:00:00.500Z").valueOf());
    });
  });

  describe("result validation", () => {
    it("should ensure all results have valid start and end times", () => {
      const ranges1 = [
        { start: dayjs("2023-06-01T09:00:00Z"), end: dayjs("2023-06-01T12:00:00Z") },
        { start: dayjs("2023-06-01T14:00:00Z"), end: dayjs("2023-06-01T17:00:00Z") },
      ];
      const ranges2 = [
        { start: dayjs("2023-06-01T10:00:00Z"), end: dayjs("2023-06-01T13:00:00Z") },
        { start: dayjs("2023-06-01T15:00:00Z"), end: dayjs("2023-06-01T18:00:00Z") },
      ];

      const result = intersect([ranges1, ranges2]);

      result.forEach((intersection) => {
        expect(intersection.start).toBeDefined();
        expect(intersection.end).toBeDefined();
        expect(intersection.start.isBefore(intersection.end)).toBe(true);
        expect(intersection.start.isValid()).toBe(true);
        expect(intersection.end.isValid()).toBe(true);
      });
    });

    it("should ensure results are properly bounded by input ranges", () => {
      const ranges1 = [{ start: dayjs("2023-06-01T09:00:00Z"), end: dayjs("2023-06-01T12:00:00Z") }];
      const ranges2 = [{ start: dayjs("2023-06-01T10:00:00Z"), end: dayjs("2023-06-01T13:00:00Z") }];

      const result = intersect([ranges1, ranges2]);

      expect(result).toHaveLength(1);
      const intersection = result[0];

      expect(intersection.start.valueOf() >= ranges1[0].start.valueOf()).toBe(true);
      expect(intersection.start.valueOf() >= ranges2[0].start.valueOf()).toBe(true);
      expect(intersection.end.valueOf() <= ranges1[0].end.valueOf()).toBe(true);
      expect(intersection.end.valueOf() <= ranges2[0].end.valueOf()).toBe(true);
    });
  });

  describe("gap scenarios", () => {
    it("should return an empty array when one user's availability is in the gap of another's", () => {
      const userA_Availability = [
        { start: dayjs("2023-07-01T09:00:00Z"), end: dayjs("2023-07-01T12:00:00Z") },
        { start: dayjs("2023-07-01T14:00:00Z"), end: dayjs("2023-07-01T17:00:00Z") },
      ];
      const userB_Availability = [
        { start: dayjs("2023-07-01T12:00:00Z"), end: dayjs("2023-07-01T14:00:00Z") },
      ];

      const result = intersect([userA_Availability, userB_Availability]);
      expect(result).toEqual([]);
    });
  });

  describe("timezone offset exclusion bug", () => {
    it("should successfully mix UTC and timezone-aware dayjs objects in subtract", () => {
      const TIMEZONE = "Asia/Kolkata"; // IST timezone (+05:30)

      const sourceRanges = [
        { start: dayjs.utc("2024-05-31T12:30:00.000Z"), end: dayjs.utc("2024-05-31T13:30:00.000Z") },
        { start: dayjs.utc("2024-05-31T13:30:00.000Z"), end: dayjs.utc("2024-05-31T14:30:00.000Z") },
        { start: dayjs.utc("2024-05-31T14:30:00.000Z"), end: dayjs.utc("2024-05-31T15:30:00.000Z") },
        { start: dayjs.utc("2024-05-31T15:30:00.000Z"), end: dayjs.utc("2024-05-31T16:30:00.000Z") },
        { start: dayjs.utc("2024-05-31T16:30:00.000Z"), end: dayjs.utc("2024-05-31T17:30:00.000Z") },
        { start: dayjs.utc("2024-05-31T17:30:00.000Z"), end: dayjs.utc("2024-05-31T18:30:00.000Z") },
      ];

      const excludedRanges = [
        {
          start: dayjs("2024-05-31T12:30:00.000Z").tz(TIMEZONE),
          end: dayjs("2024-05-31T23:59:59.999Z").tz(TIMEZONE),
        },
      ];

      const result = subtract(sourceRanges, excludedRanges);

      expect(result).toHaveLength(0);
    });

    it("should demonstrate timezone handling when same timezone", () => {
      const TIMEZONE = "Asia/Kolkata";

      const sourceRange = {
        start: dayjs("2024-05-31T12:30:00.000Z").tz(TIMEZONE),
        end: dayjs("2024-05-31T13:30:00.000Z").tz(TIMEZONE),
      };

      const excludedRange = {
        start: dayjs("2024-05-31T12:30:00.000Z").tz(TIMEZONE),
        end: dayjs("2024-05-31T18:00:00.000Z").tz(TIMEZONE),
      };

      const result = subtract([sourceRange], [excludedRange]);

      expect(result).toHaveLength(0);
    });

    it("should not extend ranges instead of excluding busy times", () => {
      const dateRanges = [
        { start: dayjs("2024-05-31T04:00:00.000Z"), end: dayjs("2024-05-31T12:30:00.000Z") },
        { start: dayjs("2024-06-01T04:00:00.000Z"), end: dayjs("2024-06-01T12:30:00.000Z") },
        { start: dayjs("2024-06-02T04:00:00.000Z"), end: dayjs("2024-06-02T12:30:00.000Z") },
        { start: dayjs("2024-06-03T04:00:00.000Z"), end: dayjs("2024-06-03T12:30:00.000Z") },
        { start: dayjs("2024-06-04T04:00:00.000Z"), end: dayjs("2024-06-04T12:30:00.000Z") },
        { start: dayjs("2024-06-05T04:00:00.000Z"), end: dayjs("2024-06-05T12:30:00.000Z") },
      ];

      // formattedBusyTimes from failing ROLLING_WINDOW test - this is the booking that should NOT affect dateRanges
      const formattedBusyTimes = [
        { start: dayjs("2024-06-01T18:30:00.000Z"), end: dayjs("2024-06-02T18:30:00.000Z") },
      ];

      const result = subtract(dateRanges, formattedBusyTimes);

      // What the result SHOULD be (correct behavior): June 2 range is properly excluded due to overlapping busy time
      const expectedCorrectedOutput = [
        { start: dayjs("2024-05-31T04:00:00.000Z"), end: dayjs("2024-05-31T12:30:00.000Z") },
        { start: dayjs("2024-06-01T04:00:00.000Z"), end: dayjs("2024-06-01T12:30:00.000Z") },
        { start: dayjs("2024-06-03T04:00:00.000Z"), end: dayjs("2024-06-03T12:30:00.000Z") },
        { start: dayjs("2024-06-04T04:00:00.000Z"), end: dayjs("2024-06-04T12:30:00.000Z") },
        { start: dayjs("2024-06-05T04:00:00.000Z"), end: dayjs("2024-06-05T12:30:00.000Z") },
      ];

      expect(result).toHaveLength(5); // Correct: June 2 range is properly excluded
      expect(result[0].end.toISOString()).toBe("2024-05-31T12:30:00.000Z"); // Correct: no extension
      expect(result[1].end.toISOString()).toBe("2024-06-01T12:30:00.000Z"); // Correct: no extension
      expect(result.find((r) => r.start.toISOString() === "2024-06-02T04:00:00.000Z")).toBeUndefined(); // Correct: June 2 excluded
    });
  });
});
