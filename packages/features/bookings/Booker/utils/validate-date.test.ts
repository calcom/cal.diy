import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getValidMonth, getValidDate } from "./validate-date";
import dayjs from "@calcom/dayjs";

describe("validate-date", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getValidMonth", () => {
    it("returns null for garbage", () => {
      expect(getValidMonth("garbage")).toBeNull();
    });

    it("returns null for invalid month like 2026-13", () => {
      expect(getValidMonth("2026-13")).toBeNull();
    });

    it("returns null for extreme year like 99999-01", () => {
      expect(getValidMonth("99999-01")).toBeNull();
    });

    it("clamps past month to current month", () => {
      expect(getValidMonth("2026-09")).toBe("2026-10");
      expect(getValidMonth("2020-01")).toBe("2026-10");
    });

    it("returns future month correctly", () => {
      expect(getValidMonth("2026-11")).toBe("2026-11");
      expect(getValidMonth("2076-10")).toBe("2076-10");
    });

    it("returns current month correctly", () => {
      expect(getValidMonth("2026-10")).toBe("2026-10");
    });
  });

  describe("getValidDate", () => {
    it("returns null for garbage", () => {
      expect(getValidDate("garbage")).toBeNull();
    });

    it("returns null for invalid date like 2026-02-31", () => {
      expect(getValidDate("2026-02-31")).toBeNull();
    });

    it("returns null for past date", () => {
      expect(getValidDate("2026-10-05")).toBeNull();
      expect(getValidDate("2020-01-01")).toBeNull();
    });

    it("returns today's date correctly", () => {
      expect(getValidDate("2026-10-06")).toBe("2026-10-06");
    });

    it("returns future date correctly", () => {
      expect(getValidDate("2026-10-07")).toBe("2026-10-07");
    });
  });
});
