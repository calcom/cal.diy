import process from "node:process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { transformDateOverridesForAtom } from "./for-atom";

process.env.TZ = "America/New_York";

const makeOverride = (
  date: string,
  startTime: string,
  endTime: string
): { date: Date; startTime: Date; endTime: Date } => ({
  date: new Date(`${date}T00:00:00.000Z`),
  startTime: new Date(`1970-01-01T${startTime}:00.000Z`),
  endTime: new Date(`1970-01-01T${endTime}:00.000Z`),
});

describe("transformDateOverridesForAtom timezone handling", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("groups ranges for the same override date when the server timezone is not UTC", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T14:00:00.000Z"));

    const result = transformDateOverridesForAtom(
      {
        availability: [
          makeOverride("2026-10-10", "09:00", "12:00"),
          makeOverride("2026-10-10", "14:00", "17:00"),
        ],
      },
      "Europe/London"
    );

    expect(result).toHaveLength(1);
    expect(result[0].ranges).toEqual([
      {
        start: new Date("2026-10-10T09:00:00.000Z"),
        end: new Date("2026-10-10T12:00:00.000Z"),
      },
      {
        start: new Date("2026-10-10T14:00:00.000Z"),
        end: new Date("2026-10-10T17:00:00.000Z"),
      },
    ]);
  });

  it("keeps an override for today in the schedule timezone", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T14:00:00.000Z"));

    const result = transformDateOverridesForAtom(
      { availability: [makeOverride("2026-10-05", "09:00", "12:00")] },
      "Europe/London"
    );

    expect(result).toHaveLength(1);
    expect(result[0].ranges).toHaveLength(1);
  });
});
