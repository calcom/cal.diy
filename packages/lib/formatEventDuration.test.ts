import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import {
  getDurationAccessibleLabel,
  getDurationFormatted,
  getDurationMinutesAccessibleLabel,
  getDurationMinutesFormatted,
} from "./formatEventDuration";

type MockOptions = { count?: number; unit?: string };

const mockT = ((key: string, options?: MockOptions) => {
  const count = options?.count ?? 0;
  switch (key) {
    case "minute_one_short":
      return `${count}m`;
    case "hour_one_short":
      return `${count}h`;
    case "multiple_duration_timeUnit_short":
      return options?.unit === "hour" ? `${count}h` : `${count}m`;
    case "minute":
      return count === 1 ? `${count} minute` : `${count} minutes`;
    case "hour":
      return count === 1 ? `${count} hour` : `${count} hours`;
    default:
      return key;
  }
}) as TFunction;

describe("formatEventDuration", () => {
  describe("getDurationFormatted", () => {
    it("formats minutes under an hour", () => {
      expect(getDurationFormatted(30, mockT)).toBe("30m");
      expect(getDurationFormatted(1, mockT)).toBe("1m");
    });

    it("formats whole hours", () => {
      expect(getDurationFormatted(60, mockT)).toBe("1h");
      expect(getDurationFormatted(120, mockT)).toBe("2h");
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
    it("announces minutes under an hour", () => {
      expect(getDurationAccessibleLabel(30, mockT)).toBe("30 minutes");
      expect(getDurationAccessibleLabel(1, mockT)).toBe("1 minute");
    });

    it("announces whole hours", () => {
      expect(getDurationAccessibleLabel(60, mockT)).toBe("1 hour");
      expect(getDurationAccessibleLabel(120, mockT)).toBe("2 hours");
    });

    it("announces hours and minutes", () => {
      expect(getDurationAccessibleLabel(90, mockT)).toBe("1 hour 30 minutes");
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

    it("returns null for empty values", () => {
      expect(getDurationMinutesFormatted(undefined, mockT)).toBeNull();
      expect(getDurationMinutesFormatted(0, mockT)).toBeNull();
    });
  });

  describe("getDurationMinutesAccessibleLabel", () => {
    it("announces total minutes for long durations", () => {
      expect(getDurationMinutesAccessibleLabel(90, mockT)).toBe("90 minutes");
      expect(getDurationMinutesAccessibleLabel(60, mockT)).toBe("60 minutes");
    });

    it("returns null for empty values", () => {
      expect(getDurationMinutesAccessibleLabel(undefined, mockT)).toBeNull();
      expect(getDurationMinutesAccessibleLabel(0, mockT)).toBeNull();
    });
  });
});
