import dayjs from "@calcom/dayjs";
import { describe, expect, it } from "vitest";
import { getEventSegmentForDay, mergeOverlappingDateRanges } from "./index";

const day = dayjs("2024-01-10T00:00:00");
const segment = (start: string, end: string, forDay = day) => {
  const result = getEventSegmentForDay({ start: new Date(start), end: new Date(end) }, forDay);
  return result && [result.start.format("YYYY-MM-DD HH:mm"), result.end.format("YYYY-MM-DD HH:mm")];
};

describe("getEventSegmentForDay", () => {
  it("returns an event within the day as is", () => {
    expect(segment("2024-01-10T09:00:00", "2024-01-10T10:00:00")).toEqual([
      "2024-01-10 09:00",
      "2024-01-10 10:00",
    ]);
  });

  it("returns null for events on other days", () => {
    expect(segment("2024-01-09T09:00:00", "2024-01-09T10:00:00")).toBeNull();
    expect(segment("2024-01-11T09:00:00", "2024-01-11T10:00:00")).toBeNull();
  });

  it("splits a multi-day event into one segment per day it covers", () => {
    const event = ["2024-01-09T14:00:00", "2024-01-11T16:00:00"] as const;

    expect(segment(...event, day.subtract(1, "day"))).toEqual(["2024-01-09 14:00", "2024-01-10 00:00"]);
    expect(segment(...event, day)).toEqual(["2024-01-10 00:00", "2024-01-11 00:00"]);
    expect(segment(...event, day.add(1, "day"))).toEqual(["2024-01-11 00:00", "2024-01-11 16:00"]);
    expect(segment(...event, day.add(2, "day"))).toBeNull();
  });

  it("doesn't spill an all-day event that ends at midnight into the next day", () => {
    const event = ["2024-01-10T00:00:00", "2024-01-11T00:00:00"] as const;

    expect(segment(...event, day)).toEqual(["2024-01-10 00:00", "2024-01-11 00:00"]);
    expect(segment(...event, day.add(1, "day"))).toBeNull();
  });

  it("keeps events without a duration on the day they start", () => {
    expect(segment("2024-01-10T00:00:00", "2024-01-10T00:00:00")).toEqual([
      "2024-01-10 00:00",
      "2024-01-10 00:00",
    ]);
    expect(segment("2024-01-10T00:00:00", "2024-01-10T00:00:00", day.subtract(1, "day"))).toBeNull();
  });
});

describe("mergeOverlappingDateRanges", () => {
  it("returns empty array when input is empty", () => {
    expect(mergeOverlappingDateRanges([])).toEqual([]);
  });

  it("returns a single range as is", () => {
    const single = [
      {
        start: new Date("2024-01-10T09:00:00Z"),
        end: new Date("2024-01-10T12:00:00Z"),
      },
    ];
    expect(mergeOverlappingDateRanges(single)).toEqual([
      {
        start: new Date("2024-01-10T09:00:00Z"),
        end: new Date("2024-01-10T12:00:00Z"),
      },
    ]);
  });

  it("does not truncate the end time when a longer event completely contains a shorter event (#30419)", () => {
    const ranges = [
      {
        start: new Date("2024-01-10T09:00:00Z"),
        end: new Date("2024-01-10T12:00:00Z"),
      },
      {
        start: new Date("2024-01-10T10:00:00Z"),
        end: new Date("2024-01-10T11:00:00Z"),
      },
    ];
    const merged = mergeOverlappingDateRanges(ranges);

    expect(merged).toHaveLength(1);
    expect(merged[0].start.toISOString()).toBe(new Date("2024-01-10T09:00:00Z").toISOString());
    expect(merged[0].end.toISOString()).toBe(new Date("2024-01-10T12:00:00Z").toISOString());
  });

  it("handles identical start times with different end times", () => {
    const ranges = [
      {
        start: new Date("2024-01-10T09:00:00Z"),
        end: new Date("2024-01-10T10:00:00Z"),
      },
      {
        start: new Date("2024-01-10T09:00:00Z"),
        end: new Date("2024-01-10T12:00:00Z"),
      },
    ];
    const merged = mergeOverlappingDateRanges(ranges);

    expect(merged).toHaveLength(1);
    expect(merged[0].start.toISOString()).toBe(new Date("2024-01-10T09:00:00Z").toISOString());
    expect(merged[0].end.toISOString()).toBe(new Date("2024-01-10T12:00:00Z").toISOString());
  });

  it("merges partially overlapping consecutive events", () => {
    const ranges = [
      {
        start: new Date("2024-01-10T09:00:00Z"),
        end: new Date("2024-01-10T11:00:00Z"),
      },
      {
        start: new Date("2024-01-10T10:30:00Z"),
        end: new Date("2024-01-10T12:30:00Z"),
      },
    ];
    const merged = mergeOverlappingDateRanges(ranges);

    expect(merged).toHaveLength(1);
    expect(merged[0].start.toISOString()).toBe(new Date("2024-01-10T09:00:00Z").toISOString());
    expect(merged[0].end.toISOString()).toBe(new Date("2024-01-10T12:30:00Z").toISOString());
  });

  it("merges adjacent touching events", () => {
    const ranges = [
      {
        start: new Date("2024-01-10T09:00:00Z"),
        end: new Date("2024-01-10T10:00:00Z"),
      },
      {
        start: new Date("2024-01-10T10:00:00Z"),
        end: new Date("2024-01-10T11:00:00Z"),
      },
    ];
    const merged = mergeOverlappingDateRanges(ranges);

    expect(merged).toHaveLength(1);
    expect(merged[0].start.toISOString()).toBe(new Date("2024-01-10T09:00:00Z").toISOString());
    expect(merged[0].end.toISOString()).toBe(new Date("2024-01-10T11:00:00Z").toISOString());
  });

  it("does not merge disjoint non-overlapping events", () => {
    const ranges = [
      {
        start: new Date("2024-01-10T09:00:00Z"),
        end: new Date("2024-01-10T10:00:00Z"),
      },
      {
        start: new Date("2024-01-10T11:00:00Z"),
        end: new Date("2024-01-10T12:00:00Z"),
      },
    ];
    const merged = mergeOverlappingDateRanges(ranges);

    expect(merged).toHaveLength(2);
    expect(merged[0].start.toISOString()).toBe(new Date("2024-01-10T09:00:00Z").toISOString());
    expect(merged[0].end.toISOString()).toBe(new Date("2024-01-10T10:00:00Z").toISOString());
    expect(merged[1].start.toISOString()).toBe(new Date("2024-01-10T11:00:00Z").toISOString());
    expect(merged[1].end.toISOString()).toBe(new Date("2024-01-10T12:00:00Z").toISOString());
  });

  it("does not mutate the original input array", () => {
    const range1 = {
      start: new Date("2024-01-10T10:00:00Z"),
      end: new Date("2024-01-10T11:00:00Z"),
    };
    const range2 = {
      start: new Date("2024-01-10T09:00:00Z"),
      end: new Date("2024-01-10T12:00:00Z"),
    };
    const input = [range1, range2];

    mergeOverlappingDateRanges(input);

    expect(input[0]).toBe(range1);
    expect(input[1]).toBe(range2);
  });
});
