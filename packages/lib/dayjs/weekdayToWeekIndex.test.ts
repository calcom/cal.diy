import { describe, expect, it } from "vitest";

import { weekdayToWeekIndex } from "./index";

describe("weekdayToWeekIndex", () => {
  it("returns 0 for undefined", () => {
    expect(weekdayToWeekIndex(undefined)).toBe(0);
  });

  it("maps weekday strings to their index", () => {
    expect(weekdayToWeekIndex("Sunday")).toBe(0);
    expect(weekdayToWeekIndex("Monday")).toBe(1);
    expect(weekdayToWeekIndex("Saturday")).toBe(6);
  });

  it("returns a valid numeric weekday index (0-6) unchanged", () => {
    expect(weekdayToWeekIndex(0)).toBe(0);
    expect(weekdayToWeekIndex(1)).toBe(1);
    expect(weekdayToWeekIndex(5)).toBe(5);
    expect(weekdayToWeekIndex(6)).toBe(6);
  });

  it("clamps out-of-range numeric input to 0", () => {
    expect(weekdayToWeekIndex(7)).toBe(0);
    expect(weekdayToWeekIndex(-1)).toBe(0);
  });
});
