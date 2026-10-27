import { describe, it, expect } from "vitest";

import type { Dayjs } from "@calcom/dayjs";
import dayjs from "@calcom/dayjs";

import { getAggregatedAvailability } from "./getAggregatedAvailability";

// Helper to check if a time range overlaps with availability
const isAvailable = (availability: { start: Dayjs; end: Dayjs }[], range: { start: Dayjs; end: Dayjs }) => {
  return availability.some(({ start, end }) => {
    return start <= range.start && end >= range.end;
  });
};

describe("getAggregatedAvailability", () => {
  // rr-host availability used to combine into erroneous slots, this confirms it no longer happens
  it("should not merge RR availability resulting in an unavailable slot due to overlap", () => {
    const userAvailability = [
      {
        dateRanges: [],
        oooExcludedDateRanges: [
          { start: dayjs("2025-01-23T11:00:00.000Z"), end: dayjs("2025-01-23T11:20:00.000Z") },
          { start: dayjs("2025-01-23T16:10:00.000Z"), end: dayjs("2025-01-23T16:30:00.000Z") },
        ],
        user: { isFixed: false },
      },
      {
        dateRanges: [],
        oooExcludedDateRanges: [
          { start: dayjs("2025-01-23T11:15:00.000Z"), end: dayjs("2025-01-23T11:30:00.000Z") },
          { start: dayjs("2025-01-23T13:20:00.000Z"), end: dayjs("2025-01-23T13:30:00.000Z") },
        ],
        user: { isFixed: false },
      },
    ];

    const result = getAggregatedAvailability(userAvailability, "ROUND_ROBIN");
    const timeRangeToCheckBusy = {
      start: dayjs("2025-01-23T11:00:00.000Z"),
      end: dayjs("2025-01-23T11:30:00.000Z"),
    };

    expect(isAvailable(result, timeRangeToCheckBusy)).toBe(false);

    const timeRangeToCheckAvailable = {
      start: dayjs("2025-01-23T11:00:00.000Z"),
      end: dayjs("2025-01-23T11:20:00.000Z"),
    };

    expect(isAvailable(result, timeRangeToCheckAvailable)).toBe(true);
  });

  it("it returns the right amount of date ranges even if the end time is before the start time", () => {
    const userAvailability = [
      {
        dateRanges: [],
        oooExcludedDateRanges: [
          { start: dayjs("2025-01-27T14:00:00.000Z"), end: dayjs("2025-01-27T04:30-05:00") },
        ],
        user: { isFixed: false },
      },
      {
        dateRanges: [],
        oooExcludedDateRanges: [
          { start: dayjs("2025-01-27T14:00:00.000Z"), end: dayjs("2025-01-27T14:45:00.000Z") },
        ],
        user: { isFixed: false },
      },
    ];

    const result = getAggregatedAvailability(userAvailability, "ROUND_ROBIN");

    expect(result).toEqual([
      {
        start: dayjs("2025-01-27T14:00:00.000Z"),
        end: dayjs("2025-01-27T09:30:00.000Z"),
      },
      {
        start: dayjs("2025-01-27T14:00:00.000Z"),
        end: dayjs("2025-01-27T14:45:00.000Z"),
      },
    ]);
  });

  // validates fixed host behaviour, they all have to be available
  it("correctly joins fixed host availability resulting in one or more combined date ranges", () => {
    const userAvailability = [
      {
        dateRanges: [],
        oooExcludedDateRanges: [
          { start: dayjs("2025-01-23T11:00:00.000Z"), end: dayjs("2025-01-23T11:20:00.000Z") },
          { start: dayjs("2025-01-23T16:10:00.000Z"), end: dayjs("2025-01-23T16:30:00.000Z") },
        ],
        user: { isFixed: true },
      },
      {
        dateRanges: [],
        oooExcludedDateRanges: [
          { start: dayjs("2025-01-23T11:15:00.000Z"), end: dayjs("2025-01-23T11:30:00.000Z") },
          { start: dayjs("2025-01-23T13:20:00.000Z"), end: dayjs("2025-01-23T13:30:00.000Z") },
        ],
        user: { isFixed: true },
      },
    ];

    const result = getAggregatedAvailability(userAvailability, "ROUND_ROBIN");
    const timeRangeToCheckBusy = {
      start: dayjs("2025-01-23T11:00:00.000Z"),
      end: dayjs("2025-01-23T11:30:00.000Z"),
    };

    expect(isAvailable(result, timeRangeToCheckBusy)).toBe(false);

    expect(result[0].start.format()).toEqual(dayjs("2025-01-23T11:15:00.000Z").format());
    expect(result[0].end.format()).toEqual(dayjs("2025-01-23T11:20:00.000Z").format());
  });

  // Combines rr hosts and fixed hosts, both fixed and one of the rr hosts has to be available for the whole period
  // All fixed user ranges are merged with each rr-host
  it("Fixed hosts and at least one rr host available between 11:00-11:30 & 12:30-13:00 on January 23, 2025", () => {
    // Both fixed user A and B are available 11:00-11:30 & 12:30-13:00 & 13:15-13:30
    // Only user C (rr) is available 11:00-11:30 and only user D (rr) is available 12:30-13:00
    // No rr users are available 13:15-13:30 and this date range should not be a result.
    const userAvailability = [
      {
        dateRanges: [],
        oooExcludedDateRanges: [
          { start: dayjs("2025-01-23T11:00:00.000Z"), end: dayjs("2025-01-23T11:30:00.000Z") },
          { start: dayjs("2025-01-23T12:30:00.000Z"), end: dayjs("2025-01-23T13:00:00.000Z") },
          { start: dayjs("2025-01-23T13:15:00.000Z"), end: dayjs("2025-01-23T13:30:00.000Z") },
          { start: dayjs("2025-01-23T16:10:00.000Z"), end: dayjs("2025-01-23T16:30:00.000Z") },
        ],
        user: { isFixed: true },
      },
      {
        dateRanges: [],
        oooExcludedDateRanges: [
          { start: dayjs("2025-01-23T11:00:00.000Z"), end: dayjs("2025-01-23T11:30:00.000Z") },
          { start: dayjs("2025-01-23T12:30:00.000Z"), end: dayjs("2025-01-23T13:00:00.000Z") },
          { start: dayjs("2025-01-23T13:15:00.000Z"), end: dayjs("2025-01-23T13:30:00.000Z") },
          { start: dayjs("2025-01-23T13:20:00.000Z"), end: dayjs("2025-01-23T13:30:00.000Z") },
        ],
        user: { isFixed: true },
      },
      {
        dateRanges: [],
        oooExcludedDateRanges: [
          { start: dayjs("2025-01-23T11:00:00.000Z"), end: dayjs("2025-01-23T11:30:00.000Z") },
        ],
        user: { isFixed: false },
      },
      {
        dateRanges: [],
        oooExcludedDateRanges: [
          { start: dayjs("2025-01-23T12:30:00.000Z"), end: dayjs("2025-01-23T13:00:00.000Z") },
        ],
        user: { isFixed: false },
      },
    ];

    const result = getAggregatedAvailability(userAvailability, "ROUND_ROBIN");
    const timeRangeToCheckAvailable = {
      start: dayjs("2025-01-23T11:00:00.000Z"),
      end: dayjs("2025-01-23T11:30:00.000Z"),
    };

    expect(isAvailable(result, timeRangeToCheckAvailable)).toBe(true);

    expect(result[0].start.format()).toEqual(dayjs("2025-01-23T11:00:00.000Z").format());
    expect(result[0].end.format()).toEqual(dayjs("2025-01-23T11:30:00.000Z").format());
    expect(result[1].start.format()).toEqual(dayjs("2025-01-23T12:30:00.000Z").format());
    expect(result[1].end.format()).toEqual(dayjs("2025-01-23T13:00:00.000Z").format());
  });

  it("does not duplicate slots when multiple rr-hosts offer the same availability", () => {
    const userAvailability = [
      {
        dateRanges: [],
        oooExcludedDateRanges: [
          { start: dayjs("2025-01-23T11:00:00.000Z"), end: dayjs("2025-01-23T11:30:00.000Z") },
          { start: dayjs("2025-01-23T12:30:00.000Z"), end: dayjs("2025-01-23T13:00:00.000Z") },
          { start: dayjs("2025-01-23T13:15:00.000Z"), end: dayjs("2025-01-23T13:30:00.000Z") },
          { start: dayjs("2025-01-23T16:10:00.000Z"), end: dayjs("2025-01-23T16:30:00.000Z") },
        ],
        user: { isFixed: true },
      },
      {
        dateRanges: [],
        oooExcludedDateRanges: [
          { start: dayjs("2025-01-23T11:00:00.000Z"), end: dayjs("2025-01-23T11:30:00.000Z") },
        ],
        user: { isFixed: false },
      },
      {
        dateRanges: [],
        oooExcludedDateRanges: [
          { start: dayjs("2025-01-23T11:00:00.000Z"), end: dayjs("2025-01-23T11:30:00.000Z") },
        ],
        user: { isFixed: false },
      },
    ];

    const result = getAggregatedAvailability(userAvailability, "ROUND_ROBIN");
    const timeRangeToCheckAvailable = {
      start: dayjs("2025-01-23T11:00:00.000Z"),
      end: dayjs("2025-01-23T11:30:00.000Z"),
    };

    expect(isAvailable(result, timeRangeToCheckAvailable)).toBe(true);
    expect(result.length).toBe(1);
  });

  it("requires at least one RR host from each group to be available", () => {
    // Test scenario with two groups:
    // Group 1: Host A (available 11:00-11:30), Host B (available 12:00-12:30)
    // Group 2: Host C (available 11:15-11:45), Host D (available 12:15-12:45)
    // Fixed host: available 11:00-13:00
    // Expected: Only slots where at least one host from each group is available
    const userAvailability = [
      {
        dateRanges: [],
        oooExcludedDateRanges: [
          { start: dayjs("2025-01-23T11:00:00.000Z"), end: dayjs("2025-01-23T13:00:00.000Z") },
        ],
        user: { isFixed: true },
      },
      {
        dateRanges: [],
        oooExcludedDateRanges: [
          { start: dayjs("2025-01-23T11:00:00.000Z"), end: dayjs("2025-01-23T11:30:00.000Z") },
        ],
        user: { isFixed: false, groupId: "group1" },
      },
      {
        dateRanges: [],
        oooExcludedDateRanges: [
          { start: dayjs("2025-01-23T12:00:00.000Z"), end: dayjs("2025-01-23T12:30:00.000Z") },
        ],
        user: { isFixed: false, groupId: "group1" },
      },
      {
        dateRanges: [],
        oooExcludedDateRanges: [
          { start: dayjs("2025-01-23T11:15:00.000Z"), end: dayjs("2025-01-23T11:45:00.000Z") },
        ],
        user: { isFixed: false, groupId: "group2" },
      },
      {
        dateRanges: [],
        oooExcludedDateRanges: [
          { start: dayjs("2025-01-23T12:15:00.000Z"), end: dayjs("2025-01-23T12:45:00.000Z") },
        ],
        user: { isFixed: false, groupId: "group2" },
      },
    ];

    const result = getAggregatedAvailability(userAvailability, "ROUND_ROBIN");

    const timeRangeAvailable = {
      start: dayjs("2025-01-23T11:15:00.000Z"),
      end: dayjs("2025-01-23T11:30:00.000Z"),
    };
    expect(isAvailable(result, timeRangeAvailable)).toBe(true);

    const timeRangeAvailable2 = {
      start: dayjs("2025-01-23T12:15:00.000Z"),
      end: dayjs("2025-01-23T12:30:00.000Z"),
    };
    expect(isAvailable(result, timeRangeAvailable2)).toBe(true);

    // Should NOT be available when only one group has hosts available
    const timeRangeNotAvailable = {
      start: dayjs("2025-01-23T11:00:00.000Z"),
      end: dayjs("2025-01-23T11:15:00.000Z"),
    };
    expect(isAvailable(result, timeRangeNotAvailable)).toBe(false);

    // Should NOT be available when only one group has hosts available
    const timeRangeNotAvailable2 = {
      start: dayjs("2025-01-23T12:30:00.000Z"),
      end: dayjs("2025-01-23T12:45:00.000Z"),
    };
    expect(isAvailable(result, timeRangeNotAvailable2)).toBe(false);
  });

  it("handles single group with multiple RR hosts (union behavior)", () => {
    // Test that when all RR hosts are in the same group, we get union behavior
    // Host A: available 11:00-11:20, 16:10-16:30
    // Host B: available 11:15-11:30, 13:20-13:30
    // Expected: Union of both hosts' availability
    const userAvailability = [
      {
        dateRanges: [],
        oooExcludedDateRanges: [
          { start: dayjs("2025-01-23T11:00:00.000Z"), end: dayjs("2025-01-23T11:20:00.000Z") },
          { start: dayjs("2025-01-23T16:10:00.000Z"), end: dayjs("2025-01-23T16:30:00.000Z") },
        ],
        user: { isFixed: false },
      },
      {
        dateRanges: [],
        oooExcludedDateRanges: [
          { start: dayjs("2025-01-23T11:15:00.000Z"), end: dayjs("2025-01-23T11:30:00.000Z") },
          { start: dayjs("2025-01-23T13:20:00.000Z"), end: dayjs("2025-01-23T13:30:00.000Z") },
        ],
        user: { isFixed: false },
      },
    ];

    const result = getAggregatedAvailability(userAvailability, "ROUND_ROBIN");

    // Should be available when either host is available
    const timeRangeAvailable = {
      start: dayjs("2025-01-23T11:00:00.000Z"),
      end: dayjs("2025-01-23T11:20:00.000Z"),
    };
    expect(isAvailable(result, timeRangeAvailable)).toBe(true);

    const timeRangeAvailable2 = {
      start: dayjs("2025-01-23T13:20:00.000Z"),
      end: dayjs("2025-01-23T13:30:00.000Z"),
    };
    expect(isAvailable(result, timeRangeAvailable2)).toBe(true);

    // Should NOT be available when neither host is available
    const timeRangeNotAvailable = {
      start: dayjs("2025-01-23T11:00:00.000Z"),
      end: dayjs("2025-01-23T11:30:00.000Z"),
    };
    expect(isAvailable(result, timeRangeNotAvailable)).toBe(false);
  });

  it("handles mixed groups with some hosts having groupId and others not", () => {
    // Test scenario:
    // Group 1: Host A (available 11:00-11:45)
    // Group 2: Host B (available 11:15-12:00)
    // Default group: Host C (available 11:30-12:30), Host D (available 12:15-12:45)
    // Fixed host: available 11:00-13:00

    const userAvailability = [
      {
        dateRanges: [],
        oooExcludedDateRanges: [
          { start: dayjs("2025-01-23T11:00:00.000Z"), end: dayjs("2025-01-23T13:00:00.000Z") },
        ],
        user: { isFixed: true },
      },
      {
        dateRanges: [],
        oooExcludedDateRanges: [
          { start: dayjs("2025-01-23T11:00:00.000Z"), end: dayjs("2025-01-23T11:45:00.000Z") },
        ],
        user: { isFixed: false, groupId: "group1" },
      },
      {
        dateRanges: [],
        oooExcludedDateRanges: [
          { start: dayjs("2025-01-23T11:15:00.000Z"), end: dayjs("2025-01-23T12:00:00.000Z") },
        ],
        user: { isFixed: false, groupId: "group2" },
      },
      {
        dateRanges: [],
        oooExcludedDateRanges: [
          { start: dayjs("2025-01-23T11:30:00.000Z"), end: dayjs("2025-01-23T12:30:00.000Z") },
        ],
        user: { isFixed: false },
      },
      {
        dateRanges: [],
        oooExcludedDateRanges: [
          { start: dayjs("2025-01-23T12:15:00.000Z"), end: dayjs("2025-01-23T12:45:00.000Z") },
        ],
        user: { isFixed: false },
      },
    ];

    const result = getAggregatedAvailability(userAvailability, "ROUND_ROBIN");

    // Should be available when all groups have at least one host available
    // Fixed host + Group 1 + Group 2 + Default group all available in this time range
    const timeRangeAvailable = {
      start: dayjs("2025-01-23T11:30:00.000Z"),
      end: dayjs("2025-01-23T11:45:00.000Z"),
    };
    expect(isAvailable(result, timeRangeAvailable)).toBe(true);

    // Should NOT be available when not all groups have hosts available
    // Only Group 1, Group 2, and fixed host available, but Default group not available
    const timeRangeNotAvailable = {
      start: dayjs("2025-01-23T11:15:00.000Z"),
      end: dayjs("2025-01-23T11:30:00.000Z"),
    };
    expect(isAvailable(result, timeRangeNotAvailable)).toBe(false);

    // Should NOT be available when not all groups have hosts available
    // Only Group 1 and fixed host available, Group 2 and Default group not available
    const timeRangeNotAvailable2 = {
      start: dayjs("2025-01-23T11:00:00.000Z"),
      end: dayjs("2025-01-23T11:15:00.000Z"),
    };
    expect(isAvailable(result, timeRangeNotAvailable2)).toBe(false);

    // Should NOT be available when not all groups have hosts available
    // Only Group 2 and fixed host available, Group 1 and Default group not available
    const timeRangeNotAvailable3 = {
      start: dayjs("2025-01-23T11:45:00.000Z"),
      end: dayjs("2025-01-23T12:00:00.000Z"),
    };
    expect(isAvailable(result, timeRangeNotAvailable3)).toBe(false);
  });

  it("handles empty groups gracefully", () => {
    // Test scenario with empty groups
    const userAvailability = [
      {
        dateRanges: [],
        oooExcludedDateRanges: [
          { start: dayjs("2025-01-23T11:00:00.000Z"), end: dayjs("2025-01-23T11:30:00.000Z") },
        ],
        user: { isFixed: true },
      },
    ];

    const result = getAggregatedAvailability(userAvailability, "ROUND_ROBIN");

    // Should only have fixed host availability
    const timeRangeAvailable = {
      start: dayjs("2025-01-23T11:00:00.000Z"),
      end: dayjs("2025-01-23T11:30:00.000Z"),
    };
    expect(isAvailable(result, timeRangeAvailable)).toBe(true);
    expect(result.length).toBe(1);
  });

  it("handles scenario where one group has no available hosts", () => {
    // Test scenario where one group has no available hosts
    // Group 1: Host A (available 11:00-11:30)
    // Group 2: Host B (not available at all)
    // Fixed host: available 11:00-13:00
    const userAvailability = [
      {
        dateRanges: [],
        oooExcludedDateRanges: [
          { start: dayjs("2025-01-23T11:00:00.000Z"), end: dayjs("2025-01-23T13:00:00.000Z") },
        ],
        user: { isFixed: true },
      },
      {
        dateRanges: [],
        oooExcludedDateRanges: [
          { start: dayjs("2025-01-23T11:00:00.000Z"), end: dayjs("2025-01-23T11:30:00.000Z") },
        ],
        user: { isFixed: false, groupId: "group1" },
      },
      {
        dateRanges: [],
        oooExcludedDateRanges: [], // No availability
        user: { isFixed: false, groupId: "group2" },
      },
    ];

    const result = getAggregatedAvailability(userAvailability, "ROUND_ROBIN");

    // Should NOT be available when one group has no hosts available
    const timeRangeNotAvailable = {
      start: dayjs("2025-01-23T11:00:00.000Z"),
      end: dayjs("2025-01-23T11:30:00.000Z"),
    };
    expect(isAvailable(result, timeRangeNotAvailable)).toBe(false);
  });

  it("returns no availability when a fixed host is fully busy, even if an rr host is free", () => {
    const userAvailability = [
      {
        dateRanges: [],
        oooExcludedDateRanges: [],
        user: { isFixed: true },
      },
      {
        dateRanges: [],
        oooExcludedDateRanges: [
          { start: dayjs("2025-01-23T11:00:00.000Z"), end: dayjs("2025-01-23T11:30:00.000Z") },
        ],
        user: { isFixed: false },
      },
    ];

    const result = getAggregatedAvailability(userAvailability, "ROUND_ROBIN");

    expect(result).toEqual([]);
  });

  it("returns no availability when fixed hosts have no time in common, even if an rr host is free", () => {
    const userAvailability = [
      {
        dateRanges: [],
        oooExcludedDateRanges: [
          { start: dayjs("2025-01-23T11:00:00.000Z"), end: dayjs("2025-01-23T11:30:00.000Z") },
        ],
        user: { isFixed: true },
      },
      {
        dateRanges: [],
        oooExcludedDateRanges: [
          { start: dayjs("2025-01-23T12:00:00.000Z"), end: dayjs("2025-01-23T12:30:00.000Z") },
        ],
        user: { isFixed: true },
      },
      {
        dateRanges: [],
        oooExcludedDateRanges: [
          { start: dayjs("2025-01-23T11:00:00.000Z"), end: dayjs("2025-01-23T12:30:00.000Z") },
        ],
        user: { isFixed: false },
      },
    ];

    const result = getAggregatedAvailability(userAvailability, "ROUND_ROBIN");

    expect(result).toEqual([]);
  });
});
