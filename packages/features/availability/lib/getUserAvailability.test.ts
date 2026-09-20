import { describe, expect, it } from "vitest";

import dayjs from "@calcom/dayjs";
import { formatBusyTimesToUtc } from "@calcom/features/availability/lib/getUserAvailability";
import { subtract } from "@calcom/features/schedules/lib/date-ranges";

/**
 * Tests for timezone normalization in getUserAvailability.
 *
 * These tests verify that busy times are properly normalized to UTC before
 * being passed to subtract(), using the real formatBusyTimesToUtc from
 * getUserAvailability. Critical for Round Robin where team members may be
 * in different timezones.
 *
 * Related issue: #22150
 */

describe("Timezone Normalization for Busy Times", () => {
  describe("availability after subtract (getUserAvailability logic path)", () => {
    it("should exclude the correct slot when busy times are in different timezones (IST, EST, GMT)", () => {
      // Availability window: 09:00–17:00 UTC on 2024-01-15
      const dateRanges = [
        {
          start: dayjs("2024-01-15T09:00:00Z"),
          end: dayjs("2024-01-15T17:00:00Z"),
        },
      ];

      // Busy 09:00–10:00 UTC expressed in IST, EST, and GMT
      const busyTimes = [
        { start: "2024-01-15T14:30:00+05:30", end: "2024-01-15T15:30:00+05:30" }, // IST
        { start: "2024-01-15T04:00:00-05:00", end: "2024-01-15T05:00:00-05:00" }, // EST
        { start: "2024-01-15T09:00:00Z", end: "2024-01-15T10:00:00Z" }, // GMT
      ];

      const formattedBusyTimes = formatBusyTimesToUtc(busyTimes);
      const available = subtract(dateRanges, formattedBusyTimes);

      // 09:00–10:00 UTC should be excluded; only 10:00–17:00 UTC remains
      expect(available).toHaveLength(1);
      expect(available[0].start.toISOString()).toBe("2024-01-15T10:00:00.000Z");
      expect(available[0].end.toISOString()).toBe("2024-01-15T17:00:00.000Z");
    });

    it("should treat IST and EST busy at same UTC time as one block (Round Robin)", () => {
      // Availability: 08:00–12:00 UTC
      const dateRanges = [
        { start: dayjs("2024-01-15T08:00:00Z"), end: dayjs("2024-01-15T12:00:00Z") },
      ];

      // Same UTC slot (09:00–10:00) from two timezones
      const busyTimes = [
        { start: "2024-01-15T14:30:00+05:30", end: "2024-01-15T15:30:00+05:30" }, // IST
        { start: "2024-01-15T04:00:00-05:00", end: "2024-01-15T05:00:00-05:00" }, // EST
      ];

      const formattedBusyTimes = formatBusyTimesToUtc(busyTimes);
      const available = subtract(dateRanges, formattedBusyTimes);

      // Should yield two ranges: 08:00–09:00 and 10:00–12:00 (09:00–10:00 removed once)
      expect(available).toHaveLength(2);
      expect(available[0].start.toISOString()).toBe("2024-01-15T08:00:00.000Z");
      expect(available[0].end.toISOString()).toBe("2024-01-15T09:00:00.000Z");
      expect(available[1].start.toISOString()).toBe("2024-01-15T10:00:00.000Z");
      expect(available[1].end.toISOString()).toBe("2024-01-15T12:00:00.000Z");
    });

    it("should mark slot unavailable when all team members busy at same UTC time (Tokyo, London, NY)", () => {
      const dateRanges = [
        { start: dayjs("2024-01-15T08:00:00Z"), end: dayjs("2024-01-15T12:00:00Z") },
      ];

      const teamMembersBusyTimes = [
        { start: "2024-01-15T18:00:00+09:00", end: "2024-01-15T19:00:00+09:00" }, // Tokyo
        { start: "2024-01-15T09:00:00Z", end: "2024-01-15T10:00:00Z" }, // London
        { start: "2024-01-15T04:00:00-05:00", end: "2024-01-15T05:00:00-05:00" }, // NY
      ];

      const formattedBusyTimes = formatBusyTimesToUtc(teamMembersBusyTimes);
      const available = subtract(dateRanges, formattedBusyTimes);

      // 09:00–10:00 UTC blocked; we get 08:00–09:00 and 10:00–12:00
      expect(available).toHaveLength(2);
      expect(available[0].end.toISOString()).toBe("2024-01-15T09:00:00.000Z");
      expect(available[1].start.toISOString()).toBe("2024-01-15T10:00:00.000Z");
    });

    it("should handle DST correctly (EST vs EDT) in availability subtraction", () => {
      // Day before DST (US): 14:00–20:00 UTC
      const dateRangesBefore = [
        { start: dayjs("2024-03-09T14:00:00Z"), end: dayjs("2024-03-09T20:00:00Z") },
      ];
      const busyBefore = [
        { start: "2024-03-09T10:00:00-05:00", end: "2024-03-09T11:00:00-05:00" }, // 15:00–16:00 UTC
      ];
      const availableBefore = subtract(dateRangesBefore, formatBusyTimesToUtc(busyBefore));
      expect(availableBefore).toHaveLength(2);
      expect(availableBefore[0].end.toISOString()).toBe("2024-03-09T15:00:00.000Z");
      expect(availableBefore[1].start.toISOString()).toBe("2024-03-09T16:00:00.000Z");

      // Day after DST: 14:00–20:00 UTC
      const dateRangesAfter = [
        { start: dayjs("2024-03-11T14:00:00Z"), end: dayjs("2024-03-11T20:00:00Z") },
      ];
      const busyAfter = [
        { start: "2024-03-11T10:00:00-04:00", end: "2024-03-11T11:00:00-04:00" }, // 14:00–15:00 UTC
      ];
      const availableAfter = subtract(dateRangesAfter, formatBusyTimesToUtc(busyAfter));
      // Busy 14:00–15:00 UTC leaves one range 15:00–20:00 UTC
      expect(availableAfter).toHaveLength(1);
      expect(availableAfter[0].start.toISOString()).toBe("2024-03-11T15:00:00.000Z");
      expect(availableAfter[0].end.toISOString()).toBe("2024-03-11T20:00:00.000Z");
    });

    it("should treat Z, +00:00, -00:00 as same UTC in subtract", () => {
      const dateRanges = [
        { start: dayjs("2024-01-15T08:00:00Z"), end: dayjs("2024-01-15T12:00:00Z") },
      ];

      const busyTimes = [
        { start: "2024-01-15T09:00:00Z", end: "2024-01-15T10:00:00Z" },
        { start: "2024-01-15T09:00:00+00:00", end: "2024-01-15T10:00:00+00:00" },
        { start: "2024-01-15T09:00:00-00:00", end: "2024-01-15T10:00:00-00:00" },
      ];

      const formattedBusyTimes = formatBusyTimesToUtc(busyTimes);
      const available = subtract(dateRanges, formattedBusyTimes);

      // Same slot excluded once; 08:00–09:00 and 10:00–12:00 remain
      expect(available).toHaveLength(2);
      expect(available[0].end.toISOString()).toBe("2024-01-15T09:00:00.000Z");
      expect(available[1].start.toISOString()).toBe("2024-01-15T10:00:00.000Z");
    });

    it("should correctly exclude Tokyo midnight-crossing meeting when normalized to UTC", () => {
      // Availability: 13:00–17:00 UTC (so 14:00–16:00 UTC is the blocked part we care about)
      const dateRanges = [
        { start: dayjs("2024-01-15T13:00:00Z"), end: dayjs("2024-01-15T17:00:00Z") },
      ];

      // 11 PM–1 AM Tokyo = 14:00–16:00 UTC
      const busyTimes = [
        { start: "2024-01-15T23:00:00+09:00", end: "2024-01-16T01:00:00+09:00" },
      ];

      const formattedBusyTimes = formatBusyTimesToUtc(busyTimes);
      const available = subtract(dateRanges, formattedBusyTimes);

      expect(available).toHaveLength(2);
      expect(available[0].start.toISOString()).toBe("2024-01-15T13:00:00.000Z");
      expect(available[0].end.toISOString()).toBe("2024-01-15T14:00:00.000Z");
      expect(available[1].start.toISOString()).toBe("2024-01-15T16:00:00.000Z");
      expect(available[1].end.toISOString()).toBe("2024-01-15T17:00:00.000Z");
    });

    it("should correctly block IST busy time against UTC availability window (issue #22150)", () => {
      // Availability: 09:00–17:00 UTC
      const dateRanges = [
        { start: dayjs("2024-01-15T09:00:00Z"), end: dayjs("2024-01-15T17:00:00Z") },
      ];

      // Busy 14:30–15:30 IST = 09:00–10:00 UTC
      const busyTimes = [
        { start: "2024-01-15T14:30:00+05:30", end: "2024-01-15T15:30:00+05:30" },
      ];

      const formattedBusyTimes = formatBusyTimesToUtc(busyTimes);
      const available = subtract(dateRanges, formattedBusyTimes);

      // 09:00–10:00 UTC must be excluded
      expect(available).toHaveLength(1);
      expect(available[0].start.toISOString()).toBe("2024-01-15T10:00:00.000Z");
      expect(available[0].end.toISOString()).toBe("2024-01-15T17:00:00.000Z");
    });
  });
});
