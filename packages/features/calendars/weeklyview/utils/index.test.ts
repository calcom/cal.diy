import dayjs from "@calcom/dayjs";
import { describe, expect, it } from "vitest";
import { getEventSegmentForDay } from "./index";

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
