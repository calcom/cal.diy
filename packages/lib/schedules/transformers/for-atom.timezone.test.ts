process.env.TZ = "America/New_York";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { transformDateOverridesForAtom } from "./for-atom";

// Mirrors how date overrides are stored: `date` is UTC midnight, times are UTC on 1970-01-01.
const utcTime = (hours: number, minutes = 0) => new Date(Date.UTC(1970, 0, 1, hours, minutes));

describe("transformDateOverridesForAtom (server TZ != UTC)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T14:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("groups all ranges of one override date into a single entry", () => {
    const date = new Date("2026-10-10T00:00:00Z");
    const result = transformDateOverridesForAtom(
      {
        availability: [
          { date, startTime: utcTime(9), endTime: utcTime(12) },
          { date, startTime: utcTime(14), endTime: utcTime(17) },
        ],
      },
      "America/New_York"
    );

    expect(result).toHaveLength(1);
    expect(result[0].ranges).toEqual([
      { start: new Date("2026-10-10T09:00:00Z"), end: new Date("2026-10-10T12:00:00Z") },
      { start: new Date("2026-10-10T14:00:00Z"), end: new Date("2026-10-10T17:00:00Z") },
    ]);
  });

  it("keeps an override for today in the schedule timezone", () => {
    const result = transformDateOverridesForAtom(
      {
        availability: [
          { date: new Date("2026-10-05T00:00:00Z"), startTime: utcTime(9), endTime: utcTime(17) },
        ],
      },
      "Europe/London"
    );

    expect(result).toHaveLength(1);
    expect(result[0].ranges[0].start).toEqual(new Date("2026-10-05T09:00:00Z"));
  });

  it("still drops an override for a past date", () => {
    const result = transformDateOverridesForAtom(
      {
        availability: [
          { date: new Date("2026-10-04T00:00:00Z"), startTime: utcTime(9), endTime: utcTime(17) },
        ],
      },
      "Europe/London"
    );

    expect(result).toEqual([]);
  });
});
