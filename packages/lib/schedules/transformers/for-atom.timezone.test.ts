process.env.TZ = "America/New_York";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { transformDateOverridesForAtom } from "./for-atom";

// Date overrides are stored as a UTC date plus UTC wall-clock times, so grouping them
// must not depend on the timezone the server process happens to run in.
const utcTime = (time: string): Date => new Date(`1970-01-01T${time}:00.000Z`);

describe("transformDateOverridesForAtom (server not running in UTC)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T14:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("groups multiple ranges of the same override date into one entry", () => {
    const result = transformDateOverridesForAtom(
      {
        availability: [
          {
            date: new Date("2026-10-10T00:00:00.000Z"),
            startTime: utcTime("09:00"),
            endTime: utcTime("12:00"),
          },
          {
            date: new Date("2026-10-10T00:00:00.000Z"),
            startTime: utcTime("14:00"),
            endTime: utcTime("17:00"),
          },
        ],
      },
      "Europe/London"
    );

    expect(result).toEqual([
      {
        ranges: [
          { start: new Date("2026-10-10T09:00:00.000Z"), end: new Date("2026-10-10T12:00:00.000Z") },
          { start: new Date("2026-10-10T14:00:00.000Z"), end: new Date("2026-10-10T17:00:00.000Z") },
        ],
      },
    ]);
  });

  it("keeps an override for today in the schedule timezone", () => {
    const result = transformDateOverridesForAtom(
      {
        availability: [
          {
            date: new Date("2026-10-05T00:00:00.000Z"),
            startTime: utcTime("16:00"),
            endTime: utcTime("18:00"),
          },
        ],
      },
      "Europe/London"
    );

    expect(result).toEqual([
      {
        ranges: [{ start: new Date("2026-10-05T16:00:00.000Z"), end: new Date("2026-10-05T18:00:00.000Z") }],
      },
    ]);
  });
});
