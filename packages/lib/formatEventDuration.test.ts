import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import {
  getDurationAccessibleLabel,
  getDurationFormatted,
  getDurationMinutesAccessibleLabel,
  getDurationMinutesFormatted,
} from "./formatEventDuration";

const mockT = ((key: string, options?: { count?: number; unit?: string }) => {
  const count = options?.count ?? 0;

  switch (key) {
    case "minute_one_short":
      return `${count}m`;
    case "hour_one_short":
      return `${count}h`;
    case "multiple_duration_timeUnit_short":
      return `${count}${options?.unit === "hour" ? "h" : "m"}`;
    case "minute_one":
      return "1 minute";
    case "minute_other":
      return `${count} minutes`;
    case "hour_one":
      return "1 hour";
    case "hour_other":
      return `${count} hours`;
    default:
      return key;
  }
}) as TFunction;

describe("formatEventDuration", () => {
  describe("getDurationFormatted", () => {
    it("formats minutes under one hour", () => {
      expect(getDurationFormatted(30, mockT)).toBe("30m");
    });

    it("formats exact hours", () => {
      expect(getDurationFormatted(60, mockT)).toBe("1h");
    });

    it("formats hours and minutes", () => {
      expect(getDurationFormatted(90, mockT)).toBe("1h 30m");
    });

    it("returns null for empty values", () => {
      expect(getDurationFormatted(undefined, mockT)).toBeNull();
      expect(getDurationFormatted(0, mockT)).toBeNull();
    });
  });

  describe("getDurationAccessibleLabel", () => {
    it("announces minutes for sub-hour durations", () => {
      expect(getDurationAccessibleLabel(30, mockT)).toBe("30 minutes");
    });

    it("announces one hour for 60 minutes", () => {
      expect(getDurationAccessibleLabel(60, mockT)).toBe("1 hour");
    });

    it("announces hours and minutes for mixed durations", () => {
      expect(getDurationAccessibleLabel(90, mockT)).toBe("1 hour 30 minutes");
    });

    it("announces singular minute", () => {
      expect(getDurationAccessibleLabel(1, mockT)).toBe("1 minute");
    });

    it("returns null for empty values", () => {
      expect(getDurationAccessibleLabel(undefined, mockT)).toBeNull();
      expect(getDurationAccessibleLabel(0, mockT)).toBeNull();
    });
  });

  describe("getDurationMinutesFormatted", () => {
    it("keeps durations as total minutes", () => {
      expect(getDurationMinutesFormatted(90, mockT)).toBe("90m");
      expect(getDurationMinutesFormatted(60, mockT)).toBe("60m");
    });
  });

  describe("getDurationMinutesAccessibleLabel", () => {
    it("announces total minutes for long durations", () => {
      expect(getDurationMinutesAccessibleLabel(90, mockT)).toBe("90 minutes");
      expect(getDurationMinutesAccessibleLabel(60, mockT)).toBe("60 minutes");
    });
  });
});
