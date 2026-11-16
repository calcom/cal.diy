import { describe, expect, it } from "vitest";
import { getLastVisibleDate, getOverlayDateRange } from "./useCalendars";

describe("getLastVisibleDate", () => {
  const weekdays = [
    "2026-10-19",
    "2026-10-20",
    "2026-10-21",
    "2026-10-22",
    "2026-10-23",
    "2026-10-26",
    "2026-10-27",
  ];

  it("returns null without a selected date", () => {
    expect(
      getLastVisibleDate({ selectedDate: null, layout: "week_view", extraDays: 7, availableDays: [] })
    ).toBeNull();
  });

  it("shows only the selected date in month view", () => {
    expect(
      getLastVisibleDate({
        selectedDate: "2026-10-24",
        layout: "month_view",
        extraDays: 0,
        availableDays: weekdays,
      })
    ).toBe("2026-10-24");
  });

  it("shows consecutive days in week view", () => {
    expect(
      getLastVisibleDate({
        selectedDate: "2026-10-21",
        layout: "week_view",
        extraDays: 7,
        availableDays: weekdays,
      })
    ).toBe("2026-10-27");
  });

  it("skips days without availability in column view", () => {
    expect(
      getLastVisibleDate({
        selectedDate: "2026-10-19",
        layout: "column_view",
        extraDays: 6,
        availableDays: weekdays,
      })
    ).toBe("2026-10-26");
  });

  it("ignores available days before the selected date in column view", () => {
    expect(
      getLastVisibleDate({
        selectedDate: "2026-10-22",
        layout: "column_view",
        extraDays: 6,
        availableDays: weekdays,
      })
    ).toBe("2026-10-27");
  });

  it("falls back to the selected date in column view when nothing is available", () => {
    expect(
      getLastVisibleDate({
        selectedDate: "2026-10-19",
        layout: "column_view",
        extraDays: 6,
        availableDays: [],
      })
    ).toBe("2026-10-19");
  });
});

describe("getOverlayDateRange", () => {
  it("returns no range without a selected date", () => {
    expect(getOverlayDateRange(null, "2026-10-27")).toEqual({ dateFrom: null, dateTo: null });
  });

  it("covers the whole selected day when it is the only visible one", () => {
    expect(getOverlayDateRange("2026-10-24", null)).toEqual({
      dateFrom: "2026-10-24T00:00:00+00:00",
      dateTo: "2026-10-24T23:59:59+00:00",
    });
  });

  it("covers every day up to the last visible one", () => {
    expect(getOverlayDateRange("2026-10-21", "2026-10-27")).toEqual({
      dateFrom: "2026-10-21T00:00:00+00:00",
      dateTo: "2026-10-27T23:59:59+00:00",
    });
  });

  it("never ends before the selected date", () => {
    expect(getOverlayDateRange("2026-10-21", "2026-10-19").dateTo).toBe("2026-10-21T23:59:59+00:00");
  });
});
