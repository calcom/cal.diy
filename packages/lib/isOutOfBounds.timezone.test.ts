import process from "node:process";
process.env.TZ = "Asia/Dubai";

import dayjs from "@calcom/dayjs";
import { PeriodType } from "@calcom/prisma/enums";
import { describe, expect, it } from "vitest";
import { calculatePeriodLimits, getRollingWindowEndDate } from "./isOutOfBounds";

const getDayJsTimeWithUtcOffset = ({
  dateStringWithOffset,
  utcOffset,
}: {
  dateStringWithOffset: string;
  utcOffset: number;
}) => {
  if (!dateStringWithOffset.includes("+")) {
    throw new Error(
      "dateStringWithOffset should have a +. That specifies the offset. Format: YYYY-MM-DDTHH:mm:ss+HH:mm"
    );
  }
  return dayjs(dateStringWithOffset).utcOffset(utcOffset);
};

describe("getRollingWindowEndDate", () => {
  it("should return the startDate itself when that date is bookable and 0 days in future are needed", () => {
    const endDay = getRollingWindowEndDate({
      startDateInBookerTz: getDayJsTimeWithUtcOffset({
        dateStringWithOffset: "2024-05-02T05:09:46+11:00",
        utcOffset: 11,
      }),
      daysNeeded: 0,
      allDatesWithBookabilityStatusInBookerTz: {
        "2024-05-02": { isBookable: true },
        "2024-05-03": { isBookable: false },
      },
      countNonBusinessDays: true,
    });
    expect(endDay?.format()).toEqual("2024-05-02T23:59:59+11:00");
  });

  it("should return the last possible time of the date so that all the timeslots of the last day are considered within range ", () => {
    const endDay = getRollingWindowEndDate({
      startDateInBookerTz: getDayJsTimeWithUtcOffset({
        dateStringWithOffset: "2024-05-02T05:09:46+11:00",
        utcOffset: 11,
      }),
      daysNeeded: 2,
      allDatesWithBookabilityStatusInBookerTz: {
        "2024-05-02": { isBookable: true },
        "2024-05-03": { isBookable: true },
      },
      countNonBusinessDays: true,
    });
    expect(endDay?.format()).toEqual("2024-05-03T23:59:59+11:00");
  });

  it("Input startDate normalization - should return the startDate with 00:00 time when that date is bookable and only 1 day is needed", () => {
    const endDay = getRollingWindowEndDate({
      // startDate has a time other than 00:00
      startDateInBookerTz: getDayJsTimeWithUtcOffset({
        dateStringWithOffset: "2024-05-11T05:09:46+11:00",
        utcOffset: 11,
      }),
      daysNeeded: 1,
      allDatesWithBookabilityStatusInBookerTz: {
        "2024-05-10": { isBookable: true },
        "2024-05-11": { isBookable: true },
      },
      countNonBusinessDays: true,
    });
    expect(endDay?.format()).toEqual("2024-05-11T23:59:59+11:00");
  });

  it("should return the first bookable date when only 1 day is needed and the startDate is unavailable", () => {
    const endDay = getRollingWindowEndDate({
      startDateInBookerTz: getDayJsTimeWithUtcOffset({
        dateStringWithOffset: "2024-05-02T05:09:46+11:00",
        utcOffset: 11,
      }),
      daysNeeded: 1,
      allDatesWithBookabilityStatusInBookerTz: {
        "2024-05-02": { isBookable: false },
        "2024-05-03": { isBookable: false },
        "2024-05-04": { isBookable: true },
      },
      countNonBusinessDays: true,
    });
    expect(endDay?.format()).toEqual("2024-05-04T23:59:59+11:00");
  });

  it("can give endDay farther than daysNeeded if countNonBusinessDays=false", () => {
    // 2024-05-02 is Thursday
    // 2024-05-03 is Friday
    // 2024-05-04 is Saturday(Non business Day)
    // 2024-05-05 is Sunday(Non Business Day)
    // 2024-05-06 is Monday

    testWhenNonBusinessDaysAreBooked();
    testWhenNonBusinessDaysAreNotBooked();

    return;
    function testWhenNonBusinessDaysAreBooked() {
      const endDay = getRollingWindowEndDate({
        startDateInBookerTz: getDayJsTimeWithUtcOffset({
          dateStringWithOffset: "2024-05-02T15:09:46+11:00",
          utcOffset: 11,
        }),
        daysNeeded: 3,
        allDatesWithBookabilityStatusInBookerTz: {
          "2024-05-02": { isBookable: true },
          "2024-05-03": { isBookable: true },
          // Skipped because Saturday is non-business day
          "2024-05-04": { isBookable: true },
          // Skipped because Sunday is non-business day
          "2024-05-05": { isBookable: true },
          "2024-05-06": { isBookable: true },
          "2024-05-07": { isBookable: true },
        },
        countNonBusinessDays: false,
      });

      // Instead of 4th, it gives 6th because 2 days in b/w are non-business days which aren't counted
      expect(endDay?.format()).toEqual("2024-05-06T23:59:59+11:00");
    }

    function testWhenNonBusinessDaysAreNotBooked() {
      const endDay2 = getRollingWindowEndDate({
        startDateInBookerTz: getDayJsTimeWithUtcOffset({
          dateStringWithOffset: "2024-05-02T15:09:46+11:00",
          utcOffset: 11,
        }),
        daysNeeded: 3,
        allDatesWithBookabilityStatusInBookerTz: {
          "2024-05-02": { isBookable: true },
          "2024-05-03": { isBookable: true },
          "2024-05-04": { isBookable: false },
          "2024-05-05": { isBookable: false },
          "2024-05-06": { isBookable: true },
        },
        countNonBusinessDays: false,
      });

      // Instead of 4th, it gives 6th because 2 days in b/w are non-business days which aren't counted
      expect(endDay2?.format()).toEqual("2024-05-06T23:59:59+11:00");
    }
  });

  it("should return the first `daysNeeded` bookable days", () => {
    const endDay = getRollingWindowEndDate({
      startDateInBookerTz: getDayJsTimeWithUtcOffset({
        dateStringWithOffset: "2024-05-02T05:09:46+11:00",
        utcOffset: 11,
      }),
      daysNeeded: 3,
      allDatesWithBookabilityStatusInBookerTz: {
        "2024-05-02": { isBookable: false },
        "2024-05-03": { isBookable: false },
        "2024-05-04": { isBookable: true },
        "2024-05-05": { isBookable: true },
        "2024-05-06": { isBookable: true },
        "2024-05-07": { isBookable: true },
      },
      countNonBusinessDays: true,
    });
    expect(endDay?.format()).toEqual("2024-05-06T23:59:59+11:00");
  });

  it("should return the last bookable day if enough `daysNeeded` bookable days aren't found", () => {
    const endDay = getRollingWindowEndDate({
      startDateInBookerTz: getDayJsTimeWithUtcOffset({
        dateStringWithOffset: "2024-05-02T05:09:46+11:00",
        utcOffset: 11,
      }),
      daysNeeded: 30,
      allDatesWithBookabilityStatusInBookerTz: {
        "2024-05-02": { isBookable: false },
        "2024-05-03": { isBookable: false },
        "2024-05-04": { isBookable: true },
        "2024-05-05": { isBookable: true },
        "2024-05-06": { isBookable: false },
      },
      countNonBusinessDays: true,
    });
    expect(endDay?.format()).toEqual("2024-05-05T23:59:59+11:00");
  });

  it("should treat non existing dates in `allDatesWithBookabilityStatusInBookerTz` as having isBookable:false  the first `daysNeeded` bookable days", () => {
    const endDay = getRollingWindowEndDate({
      startDateInBookerTz: getDayJsTimeWithUtcOffset({
        dateStringWithOffset: "2024-05-02T05:09:46+11:00",
        utcOffset: 11,
      }),
      daysNeeded: 3,
      allDatesWithBookabilityStatusInBookerTz: {
        "2024-05-02": { isBookable: true },
        "2024-05-03": { isBookable: false },
        "2024-05-04": { isBookable: true },
        "2024-05-07": { isBookable: true },
      },
      countNonBusinessDays: true,
    });
    expect(endDay?.format()).toEqual("2024-05-07T23:59:59+11:00");
  });

  it("should return the last day in maximum window(that would be ROLLING_WINDOW_PERIOD_MAX_DAYS_TO_CHECK days ahead) if no bookable day is found at all", () => {
    const endDay = getRollingWindowEndDate({
      startDateInBookerTz: getDayJsTimeWithUtcOffset({
        dateStringWithOffset: "2024-05-02T05:09:46+11:00",
        utcOffset: 11,
      }),
      daysNeeded: 3,
      allDatesWithBookabilityStatusInBookerTz: {},
      countNonBusinessDays: true,
    });
    expect(endDay?.format()).toEqual("2024-07-02T23:59:59+11:00");
  });

  it("should consider the bookable day very close to ROLLING_WINDOW_PERIOD_MAX_DAYS_TO_CHECK but not beyond it", () => {
    const endDay = getRollingWindowEndDate({
      startDateInBookerTz: getDayJsTimeWithUtcOffset({
        dateStringWithOffset: "2024-05-02T05:09:46+11:00",
        utcOffset: 11,
      }),
      daysNeeded: 3,
      allDatesWithBookabilityStatusInBookerTz: {
        "2024-05-02": { isBookable: true },
        "2024-06-04": { isBookable: true },
        "2024-07-01": { isBookable: true },
        "2024-07-07": { isBookable: true },
      },
      countNonBusinessDays: true,
    });
    expect(endDay?.format()).toEqual("2024-07-01T23:59:59+11:00");
  });
});

describe("calculatePeriodLimits - PeriodType.RANGE", () => {
  /**
   * BUG FIX TEST
   *
   * The fix ensures that when a user selects a date (e.g., Jan 20) in the UI,
   * the frontend converts it to UTC midnight for that date before sending to the server.
   *
   * Example: User in Dubai (UTC+4) selects Jan 20
   * - OLD (buggy): Frontend sent midnight Jan 20 Dubai = 2024-01-19T20:00:00Z
   *   This caused the wrong date to be stored and slots to appear on Jan 19 instead of Jan 20
   * - NEW (fixed): Frontend sends 2024-01-20T00:00:00Z (UTC midnight for Jan 20)
   *   This ensures the correct date is stored regardless of user's timezone
   */

  /**
   * Helper to simulate OLD buggy frontend behavior:
   * Creates a Date representing midnight of the given date in user's local timezone
   * (This is what the DateRangePicker used to return before the fix)
   */
  function createLocalMidnight(year: number, month: number, day: number): Date {
    // month is 0-indexed (0 = January)
    return new Date(year, month, day, 0, 0, 0, 0);
  }

  /**
   * Helper to simulate NEW fixed frontend behavior:
   * Creates a Date representing midnight of the given date in UTC
   * (This is what the frontend now sends after the fix)
   */
  function createUTCMidnight(year: number, month: number, day: number): Date {
    // month is 0-indexed (0 = January)
    return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  }

  describe("demonstrates the bug that was fixed", () => {
    it("OLD buggy frontend: user selects Jan 20 but range covers Jan 19 (WRONG)", () => {
      // User in Dubai (UTC+4) selects Jan 20 in the UI
      // OLD frontend created: new Date(2024, 0, 20) = midnight Jan 20 Dubai
      // Which is 2024-01-19T20:00:00Z in UTC
      const buggyPeriodStartDate = createLocalMidnight(2024, 0, 20); // Jan 20 local
      const buggyPeriodEndDate = createLocalMidnight(2024, 0, 20);

      // Verify the buggy date is NOT Jan 20 UTC (it's Jan 19 20:00 UTC)
      // This test runs with TZ=Asia/Dubai, so local midnight Jan 20 = Jan 19 20:00 UTC
      expect(buggyPeriodStartDate.toISOString()).toBe("2024-01-19T20:00:00.000Z");

      // Event timezone: Europe/London (UTC+0)
      const eventUtcOffset = 0;

      const result = calculatePeriodLimits({
        periodType: PeriodType.RANGE,
        periodDays: null,
        periodCountCalendarDays: null,
        periodStartDate: buggyPeriodStartDate,
        periodEndDate: buggyPeriodEndDate,
        allDatesWithBookabilityStatusInBookerTz: null,
        eventUtcOffset,
        bookerUtcOffset: 240,
      });

      // With buggy input, the range covers Jan 19 instead of Jan 20!
      // This is the BUG - user selected Jan 20 but slots appear on Jan 19
      expect(result.startOfRangeStartDayInEventTz!.date()).toBe(19); // WRONG! Should be 20
      expect(result.endOfRangeEndDayInEventTz!.date()).toBe(19); // WRONG! Should be 20
    });

    it("NEW fixed frontend: user selects Jan 20 and range correctly covers Jan 20", () => {
      // User in Dubai (UTC+4) selects Jan 20 in the UI
      // NEW frontend creates: Date.UTC(2024, 0, 20) = midnight Jan 20 UTC
      // Which is 2024-01-20T00:00:00Z
      const fixedPeriodStartDate = createUTCMidnight(2024, 0, 20); // Jan 20 UTC
      const fixedPeriodEndDate = createUTCMidnight(2024, 0, 20);

      // Verify the fixed date IS Jan 20 UTC midnight
      expect(fixedPeriodStartDate.toISOString()).toBe("2024-01-20T00:00:00.000Z");

      // Event timezone: Europe/London (UTC+0)
      const eventUtcOffset = 0;

      const result = calculatePeriodLimits({
        periodType: PeriodType.RANGE,
        periodDays: null,
        periodCountCalendarDays: null,
        periodStartDate: fixedPeriodStartDate,
        periodEndDate: fixedPeriodEndDate,
        allDatesWithBookabilityStatusInBookerTz: null,
        eventUtcOffset,
        bookerUtcOffset: 240,
      });

      // With fixed input, the range correctly covers Jan 20
      expect(result.startOfRangeStartDayInEventTz!.date()).toBe(20); // CORRECT!
      expect(result.endOfRangeEndDayInEventTz!.date()).toBe(20); // CORRECT!
    });
  });

  it("should calculate period range for Jan 20 correctly when stored as UTC midnight", () => {
    // User selects Jan 20 in the UI (any timezone)
    // Frontend now correctly sends UTC midnight for Jan 20
    const periodStartDate = new Date("2024-01-20T00:00:00.000Z");
    const periodEndDate = new Date("2024-01-20T00:00:00.000Z");

    // Event timezone: Europe/London (UTC+0 in winter)
    const eventUtcOffset = 0;
    const bookerUtcOffset = 240; // Dubai UTC+4

    const result = calculatePeriodLimits({
      periodType: PeriodType.RANGE,
      periodDays: null,
      periodCountCalendarDays: null,
      periodStartDate,
      periodEndDate,
      allDatesWithBookabilityStatusInBookerTz: null,
      eventUtcOffset,
      bookerUtcOffset,
    });

    expect(result.startOfRangeStartDayInEventTz).not.toBeNull();
    expect(result.endOfRangeEndDayInEventTz).not.toBeNull();

    // Range should cover Jan 20 in event timezone (UTC)
    // - Start: 2024-01-20T00:00:00Z
    // - End: 2024-01-20T23:59:59.999Z
    const startUTC = result.startOfRangeStartDayInEventTz!.toISOString();
    const endUTC = result.endOfRangeEndDayInEventTz!.toISOString();

    expect(startUTC).toBe("2024-01-20T00:00:00.000Z");
    expect(endUTC).toBe("2024-01-20T23:59:59.999Z");

    // Verify date is Jan 20
    expect(result.startOfRangeStartDayInEventTz!.date()).toBe(20);
    expect(result.endOfRangeEndDayInEventTz!.date()).toBe(20);
  });

  it("should calculate period range correctly with non-UTC event timezone", () => {
    // User selects Jan 20 in the UI
    // Frontend sends UTC midnight for Jan 20
    const periodStartDate = new Date("2024-01-20T00:00:00.000Z");
    const periodEndDate = new Date("2024-01-20T00:00:00.000Z");

    // Event timezone: Jerusalem (UTC+2)
    const eventUtcOffset = 120; // minutes
    const bookerUtcOffset = 240; // Dubai UTC+4

    const result = calculatePeriodLimits({
      periodType: PeriodType.RANGE,
      periodDays: null,
      periodCountCalendarDays: null,
      periodStartDate,
      periodEndDate,
      allDatesWithBookabilityStatusInBookerTz: null,
      eventUtcOffset,
      bookerUtcOffset,
    });

    expect(result.startOfRangeStartDayInEventTz).not.toBeNull();
    expect(result.endOfRangeEndDayInEventTz).not.toBeNull();

    // The stored timestamp 2024-01-20T00:00:00Z in Jerusalem (UTC+2) is:
    // 2024-01-20T02:00:00+02:00 (Jan 20 at 2am Jerusalem)
    // So the date in event timezone is Jan 20
    //
    // Range should cover Jan 20 in Jerusalem timezone:
    // - Start: 2024-01-20T00:00:00+02:00 = 2024-01-19T22:00:00Z
    // - End: 2024-01-20T23:59:59+02:00 = 2024-01-20T21:59:59Z
    const startUTC = result.startOfRangeStartDayInEventTz!.toISOString();
    const endUTC = result.endOfRangeEndDayInEventTz!.toISOString();

    expect(startUTC).toBe("2024-01-19T22:00:00.000Z");
    expect(endUTC).toBe("2024-01-20T21:59:59.999Z");

    // Verify date is Jan 20 in event timezone
    expect(result.startOfRangeStartDayInEventTz!.date()).toBe(20);
    expect(result.endOfRangeEndDayInEventTz!.date()).toBe(20);
  });

  it("should produce valid 24-hour range regardless of event timezone", () => {
    // User selects Jan 20
    const periodStartDate = new Date("2024-01-20T00:00:00.000Z");
    const periodEndDate = new Date("2024-01-20T00:00:00.000Z");

    // Test with various event timezones
    const timezones = [
      { name: "UTC", offset: 0 },
      { name: "Jerusalem (UTC+2)", offset: 120 },
      { name: "Dubai (UTC+4)", offset: 240 },
      { name: "Tokyo (UTC+9)", offset: 540 },
      { name: "New York (UTC-5)", offset: -300 },
    ];

    for (const tz of timezones) {
      const result = calculatePeriodLimits({
        periodType: PeriodType.RANGE,
        periodDays: null,
        periodCountCalendarDays: null,
        periodStartDate,
        periodEndDate,
        allDatesWithBookabilityStatusInBookerTz: null,
        eventUtcOffset: tz.offset,
        bookerUtcOffset: 0,
      });

      expect(result.startOfRangeStartDayInEventTz).not.toBeNull();
      expect(result.endOfRangeEndDayInEventTz).not.toBeNull();

      // Range should be exactly 24 hours minus 1 millisecond
      const duration =
        result.endOfRangeEndDayInEventTz!.valueOf() - result.startOfRangeStartDayInEventTz!.valueOf();
      expect(duration).toBe(86400000 - 1); // 24 hours - 1ms
    }
  });

  it("should handle single-day range (start equals end)", () => {
    // User selects Jan 20 to Jan 20 (single day)
    const periodStartDate = new Date("2024-01-20T00:00:00.000Z");
    const periodEndDate = new Date("2024-01-20T00:00:00.000Z");

    const eventUtcOffset = 120; // Jerusalem
    const bookerUtcOffset = 240; // Dubai

    const result = calculatePeriodLimits({
      periodType: PeriodType.RANGE,
      periodDays: null,
      periodCountCalendarDays: null,
      periodStartDate,
      periodEndDate,
      allDatesWithBookabilityStatusInBookerTz: null,
      eventUtcOffset,
      bookerUtcOffset,
    });

    // Start and end should be on the same date
    expect(result.startOfRangeStartDayInEventTz!.date()).toBe(result.endOfRangeEndDayInEventTz!.date());

    // Range should still be valid (end > start)
    expect(result.endOfRangeEndDayInEventTz!.valueOf()).toBeGreaterThan(
      result.startOfRangeStartDayInEventTz!.valueOf()
    );
  });

  it("should handle multi-day range correctly", () => {
    // User selects Jan 20 to Jan 25
    const periodStartDate = new Date("2024-01-20T00:00:00.000Z");
    const periodEndDate = new Date("2024-01-25T00:00:00.000Z");

    const eventUtcOffset = 120; // Jerusalem
    const bookerUtcOffset = 0;

    const result = calculatePeriodLimits({
      periodType: PeriodType.RANGE,
      periodDays: null,
      periodCountCalendarDays: null,
      periodStartDate,
      periodEndDate,
      allDatesWithBookabilityStatusInBookerTz: null,
      eventUtcOffset,
      bookerUtcOffset,
    });

    // Start should be Jan 20, end should be Jan 25
    expect(result.startOfRangeStartDayInEventTz!.date()).toBe(20);
    expect(result.endOfRangeEndDayInEventTz!.date()).toBe(25);

    // Range should span 6 days (20, 21, 22, 23, 24, 25)
    const durationDays =
      (result.endOfRangeEndDayInEventTz!.valueOf() - result.startOfRangeStartDayInEventTz!.valueOf()) /
      (24 * 60 * 60 * 1000);
    expect(Math.ceil(durationDays)).toBe(6);
  });

  describe("timezone combinations that were causing date shifts", () => {
    /**
     * These tests verify the specific timezone combinations reported as buggy:
     * 1. Event timezone: UTC (offset 0), Booker: Dubai → date was shifting back a day
     * 2. Event timezone: Buenos Aires (UTC-3, offset -180), Booker: Dubai → date was shifting back a day
     * 3. Event timezone: Jerusalem (UTC+2, offset 120), Booker: Dubai → was working correctly
     *
     * The issue was that when we parse UTC midnight and convert to a negative offset timezone,
     * the local time becomes the previous day, causing startOf("day") to give the wrong date.
     */

    it("Event timezone UTC (offset 0), Booker Dubai: should show Jan 20 correctly", () => {
      // User selects Jan 20 in the UI
      // Frontend sends UTC midnight for Jan 20
      const periodStartDate = new Date("2024-01-20T00:00:00.000Z");
      const periodEndDate = new Date("2024-01-20T00:00:00.000Z");

      const eventUtcOffset = 0; // UTC
      const bookerUtcOffset = 240; // Dubai UTC+4

      const result = calculatePeriodLimits({
        periodType: PeriodType.RANGE,
        periodDays: null,
        periodCountCalendarDays: null,
        periodStartDate,
        periodEndDate,
        allDatesWithBookabilityStatusInBookerTz: null,
        eventUtcOffset,
        bookerUtcOffset,
      });

      // Should be Jan 20, NOT Jan 19
      expect(result.startOfRangeStartDayInEventTz!.date()).toBe(20);
      expect(result.endOfRangeEndDayInEventTz!.date()).toBe(20);

      // Start should be midnight UTC Jan 20
      expect(result.startOfRangeStartDayInEventTz!.toISOString()).toBe("2024-01-20T00:00:00.000Z");
    });

    it("Event timezone Buenos Aires (UTC-3, offset -180), Booker Dubai: should show Jan 20 correctly", () => {
      // User selects Jan 20 in the UI
      // Frontend sends UTC midnight for Jan 20
      const periodStartDate = new Date("2024-01-20T00:00:00.000Z");
      const periodEndDate = new Date("2024-01-20T00:00:00.000Z");

      const eventUtcOffset = -180; // Buenos Aires UTC-3
      const bookerUtcOffset = 240; // Dubai UTC+4

      const result = calculatePeriodLimits({
        periodType: PeriodType.RANGE,
        periodDays: null,
        periodCountCalendarDays: null,
        periodStartDate,
        periodEndDate,
        allDatesWithBookabilityStatusInBookerTz: null,
        eventUtcOffset,
        bookerUtcOffset,
      });

      // Should be Jan 20, NOT Jan 19
      // The bug was: UTC midnight converted to Buenos Aires = Jan 19 21:00, startOf("day") = Jan 19
      expect(result.startOfRangeStartDayInEventTz!.date()).toBe(20);
      expect(result.endOfRangeEndDayInEventTz!.date()).toBe(20);

      // Start should be midnight Jan 20 in Buenos Aires = 03:00 UTC
      expect(result.startOfRangeStartDayInEventTz!.toISOString()).toBe("2024-01-20T03:00:00.000Z");
    });

    it("Event timezone Jerusalem (UTC+2, offset 120), Booker Dubai: should show Jan 20 correctly", () => {
      // User selects Jan 20 in the UI
      // Frontend sends UTC midnight for Jan 20
      const periodStartDate = new Date("2024-01-20T00:00:00.000Z");
      const periodEndDate = new Date("2024-01-20T00:00:00.000Z");

      const eventUtcOffset = 120; // Jerusalem UTC+2
      const bookerUtcOffset = 240; // Dubai UTC+4

      const result = calculatePeriodLimits({
        periodType: PeriodType.RANGE,
        periodDays: null,
        periodCountCalendarDays: null,
        periodStartDate,
        periodEndDate,
        allDatesWithBookabilityStatusInBookerTz: null,
        eventUtcOffset,
        bookerUtcOffset,
      });

      // Should be Jan 20 (this was already working)
      expect(result.startOfRangeStartDayInEventTz!.date()).toBe(20);
      expect(result.endOfRangeEndDayInEventTz!.date()).toBe(20);

      // Start should be midnight Jan 20 in Jerusalem = 22:00 UTC Jan 19
      expect(result.startOfRangeStartDayInEventTz!.toISOString()).toBe("2024-01-19T22:00:00.000Z");
    });
  });

  describe("backward compatibility with old format data", () => {
    it("Old format: Dubai user selected Jan 20 with Dubai event timezone (two bugs canceled out)", () => {
      // Before this PR, frontend stored dates in browser timezone
      // Dubai user selecting Jan 20 stored as midnight Jan 20 Dubai = 2024-01-19T20:00:00Z
      // This "accidentally worked" when event timezone matched browser timezone
      const periodStartDate = new Date("2024-01-19T20:00:00.000Z"); // Midnight Jan 20 Dubai (old format)
      const periodEndDate = new Date("2024-01-19T20:00:00.000Z");

      const eventUtcOffset = 240; // Dubai UTC+4 (matches where the user selected the date)
      const bookerUtcOffset = 240;

      const result = calculatePeriodLimits({
        periodType: PeriodType.RANGE,
        periodDays: null,
        periodCountCalendarDays: null,
        periodStartDate,
        periodEndDate,
        allDatesWithBookabilityStatusInBookerTz: null,
        eventUtcOffset,
        bookerUtcOffset,
      });

      // Old format is detected (time is not 00:00:00 UTC)
      // Legacy behavior: convert to event timezone → Jan 20 00:00 Dubai → correct!
      expect(result.startOfRangeStartDayInEventTz!.date()).toBe(20);
      expect(result.endOfRangeEndDayInEventTz!.date()).toBe(20);
    });

    it("Old format: Dubai user selected Jan 20 with UTC event timezone (was already broken, stays broken)", () => {
      // Before this PR, this case was already broken
      // Dubai user selecting Jan 20 stored as midnight Jan 20 Dubai = 2024-01-19T20:00:00Z
      // With UTC event timezone, this converts to Jan 19 20:00 UTC → startOf day → Jan 19
      const periodStartDate = new Date("2024-01-19T20:00:00.000Z"); // Midnight Jan 20 Dubai (old format)
      const periodEndDate = new Date("2024-01-19T20:00:00.000Z");

      const eventUtcOffset = 0; // UTC event timezone
      const bookerUtcOffset = 240; // Dubai booker

      const result = calculatePeriodLimits({
        periodType: PeriodType.RANGE,
        periodDays: null,
        periodCountCalendarDays: null,
        periodStartDate,
        periodEndDate,
        allDatesWithBookabilityStatusInBookerTz: null,
        eventUtcOffset,
        bookerUtcOffset,
      });

      // Old format is detected (time is not 00:00:00 UTC)
      // Legacy behavior: convert to UTC → Jan 19 20:00 UTC → startOf day → Jan 19
      // This was already broken before, and stays broken (no regression)
      expect(result.startOfRangeStartDayInEventTz!.date()).toBe(19);
      expect(result.endOfRangeEndDayInEventTz!.date()).toBe(19);
    });
  });
});
