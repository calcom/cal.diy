import { describe, expect, it } from "vitest";

import { getDurationAccessibleLabel, getDurationFormatted } from "./formatEventDuration";

describe("formatEventDuration", () => {
  describe("getDurationFormatted", () => {
    it("should return null for undefined or null", () => {
      expect(getDurationFormatted(undefined)).toBeNull();
      expect(getDurationFormatted(null)).toBeNull();
    });

    it("should format minutes without t function", () => {
      expect(getDurationFormatted(15)).toBe("15m");
      expect(getDurationFormatted(30)).toBe("30m");
      expect(getDurationFormatted(60)).toBe("1h");
      expect(getDurationFormatted(90)).toBe("1h 30m");
      expect(getDurationFormatted(120)).toBe("2h");
    });
  });

  describe("getDurationAccessibleLabel", () => {
    it("should return undefined for undefined or null", () => {
      expect(getDurationAccessibleLabel(undefined)).toBeUndefined();
      expect(getDurationAccessibleLabel(null)).toBeUndefined();
    });

    it("should spell out minutes and hours in plain English when t is omitted", () => {
      expect(getDurationAccessibleLabel(0)).toBe("0 minutes");
      expect(getDurationAccessibleLabel(1)).toBe("1 minute");
      expect(getDurationAccessibleLabel(15)).toBe("15 minutes");
      expect(getDurationAccessibleLabel(30)).toBe("30 minutes");
      expect(getDurationAccessibleLabel(60)).toBe("1 hour");
      expect(getDurationAccessibleLabel(90)).toBe("1 hour 30 minutes");
      expect(getDurationAccessibleLabel(120)).toBe("2 hours");
      expect(getDurationAccessibleLabel(150)).toBe("2 hours 30 minutes");
    });

    it("should translate using t function when provided", () => {
      const mockT = (key: string, options?: { count?: number; unit?: string }) => {
        const count = options?.count ?? 1;
        if (key === "minute") {
          return count === 1 ? "1 minute" : `${count} minutes`;
        }
        if (key === "hour") {
          return count === 1 ? "1 hour" : `${count} hours`;
        }
        return key;
      };

      // @ts-expect-error Mocking TFunction partially for test
      expect(getDurationAccessibleLabel(30, mockT)).toBe("30 minutes");
      // @ts-expect-error Mocking TFunction partially for test
      expect(getDurationAccessibleLabel(60, mockT)).toBe("1 hour");
      // @ts-expect-error Mocking TFunction partially for test
      expect(getDurationAccessibleLabel(90, mockT)).toBe("1 hour 30 minutes");
    });
  });
});
