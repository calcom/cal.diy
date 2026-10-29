import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getInitialBookerDateState, getValidDate, getValidMonth } from "./validate-date";

describe("Booker date query validation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 6, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getValidMonth", () => {
    it.each(["garbage", "2026-13", "2026-1", "99999-01"])("rejects invalid month %s", (month) => {
      expect(getValidMonth(month)).toBeNull();
    });

    it("moves a past month to the current month", () => {
      expect(getValidMonth("2020-01")).toBe("2026-10");
    });

    it("preserves the current and future months", () => {
      expect(getValidMonth("2026-10")).toBe("2026-10");
      expect(getValidMonth("2026-11")).toBe("2026-11");
      expect(getValidMonth("2076-10")).toBe("2076-10");
    });
  });

  describe("getValidDate", () => {
    it.each(["garbage", "2026-02-31", "2026-2-3"])("rejects invalid date %s", (date) => {
      expect(getValidDate(date)).toBeNull();
    });

    it("rejects dates before today", () => {
      expect(getValidDate("2026-10-05")).toBeNull();
      expect(getValidDate("2020-01-01")).toBeNull();
    });

    it("preserves today and future dates", () => {
      expect(getValidDate("2026-10-06")).toBe("2026-10-06");
      expect(getValidDate("2026-10-07")).toBe("2026-10-07");
    });
  });

  describe("getInitialBookerDateState", () => {
    it("falls back to the current month when both parameters are invalid", () => {
      expect(getInitialBookerDateState("garbage", "garbage")).toEqual({
        month: "2026-10",
        selectedDate: null,
      });
    });

    it("uses a valid selected date when the month parameter is invalid or past", () => {
      expect(getInitialBookerDateState("2026-13", "2027-01-01")).toEqual({
        month: "2027-01",
        selectedDate: "2027-01-01",
      });
      expect(getInitialBookerDateState("2020-01", "2027-01-01")).toEqual({
        month: "2027-01",
        selectedDate: "2027-01-01",
      });
    });
  });
});
