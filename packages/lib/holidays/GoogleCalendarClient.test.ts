import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { GoogleCalendarClient } from "./GoogleCalendarClient";

// Google returns public-holiday events as all-day events, so `start.date` is a
// bare calendar date ("2025-01-01") with no time or offset. These tests run
// under a positive-UTC-offset zone (Asia/Tokyo, +09:00) because parsing such a
// date in server-local time shifts it to the previous UTC day, which is exactly
// the case the rest of the holiday code does not expect: HolidayService reads
// every stored date back with `.utc()`, assuming it is UTC midnight.
const originalTZ = process.env.TZ;

describe("GoogleCalendarClient.fetchHolidays date parsing", () => {
  beforeAll(() => {
    process.env.TZ = "Asia/Tokyo";
  });

  afterAll(() => {
    process.env.TZ = originalTZ;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const mockFetchOnce = (items: unknown[]) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ json: async () => ({ items }) }) as unknown as Response)
    );
  };

  it("parses an all-day holiday date as UTC midnight regardless of server timezone", async () => {
    mockFetchOnce([
      {
        id: "newyear2025",
        summary: "New Year's Day",
        start: { date: "2025-01-01" },
        end: { date: "2025-01-02" },
      },
    ]);

    const client = new GoogleCalendarClient("test-key");
    const holidays = await client.fetchHolidays("JP", 2025);

    expect(holidays).toHaveLength(1);
    // Must stay on Jan 1 in UTC. Local-time parsing under +09:00 would store
    // 2024-12-31T15:00:00.000Z, which downstream `.utc()` formatting then reads
    // back as 2024-12-31 (the holiday silently moves to the day before).
    expect(holidays[0].date.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });

  it("parses a timed event's date part as UTC midnight as well", async () => {
    mockFetchOnce([
      {
        id: "evt",
        summary: "Some Day",
        start: { dateTime: "2025-05-05T00:00:00+09:00" },
        end: { dateTime: "2025-05-05T23:59:59+09:00" },
      },
    ]);

    const client = new GoogleCalendarClient("test-key");
    const holidays = await client.fetchHolidays("JP", 2025);

    expect(holidays[0].date.toISOString()).toBe("2025-05-05T00:00:00.000Z");
  });
});
