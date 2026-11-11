import dayjs from "@calcom/dayjs";
import { describe, expect, it, vi } from "vitest";
import { normalizeBookerQueryParams } from "./normalizeBookerQueryParams";

describe("normalizeBookerQueryParams", () => {
  it("falls back to the current month for invalid month and date values", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T00:00:00Z"));

    expect(normalizeBookerQueryParams({ month: "garbage", date: "not-a-date" })).toEqual({
      month: "2026-10",
      date: null,
    });
    vi.useRealTimers();
  });

  it("normalizes missing query values without treating them as an explicit month", () => {
    const currentMonth = dayjs().format("YYYY-MM");

    expect(normalizeBookerQueryParams({})).toEqual({
      month: currentMonth,
      date: null,
    });
  });

  it("uses a valid date to derive the month when the month is invalid", () => {
    expect(normalizeBookerQueryParams({ month: "2026-99", date: "2027-02-14" })).toEqual({
      month: "2027-02",
      date: "2027-02-14",
    });
  });

  it("preserves valid query values", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T00:00:00Z"));
    const currentMonth = dayjs().format("YYYY-MM");

    expect(normalizeBookerQueryParams({ month: currentMonth, date: `${currentMonth}-08` })).toEqual({
      month: currentMonth,
      date: `${currentMonth}-08`,
    });
    vi.useRealTimers();
  });

  it("falls back from past query values", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T00:00:00Z"));

    expect(normalizeBookerQueryParams({ month: "2026-09", date: "2026-10-07" })).toEqual({
      month: "2026-10",
      date: null,
    });
    vi.useRealTimers();
  });
});
