import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarEventBuilder } from "./builder";

describe("CalendarEventBuilder - buildUIDCalendarEvent", () => {
  const mockUser = {
    id: 1,
    username: "pro-user",
    email: "pro@example.com",
    name: "Pro User",
    locale: "en",
    timeZone: "UTC",
    credentials: [],
    bufferTime: 0,
    destinationCalendar: null,
  };

  beforeEach(() => {
    // Freeze system time to evaluate behavior at the exact same millisecond timestamp
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-30T09:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("generates a valid non-empty uid for a calendar event", () => {
    const builder = new CalendarEventBuilder();
    builder.setUsers([mockUser]);
    builder.calendarEvent.startTime = "2026-11-30T09:00:00Z";

    builder.buildUIDCalendarEvent();

    expect(builder.calendarEvent.uid).toBeDefined();
    expect(typeof builder.calendarEvent.uid).toBe("string");
    expect(builder.calendarEvent.uid?.length).toBeGreaterThan(0);
  });

  it("produces distinct uids when called with identical timestamp, user, and start time (#30376)", () => {
    const builder1 = new CalendarEventBuilder();
    const builder2 = new CalendarEventBuilder();

    builder1.setUsers([mockUser]);
    builder1.calendarEvent.startTime = "2026-11-30T09:00:00Z";

    builder2.setUsers([mockUser]);
    builder2.calendarEvent.startTime = "2026-11-30T09:00:00Z";

    builder1.buildUIDCalendarEvent();
    builder2.buildUIDCalendarEvent();

    expect(builder1.calendarEvent.uid).toBeDefined();
    expect(builder2.calendarEvent.uid).toBeDefined();
    expect(builder1.calendarEvent.uid).not.toBe(builder2.calendarEvent.uid);
  });

  it("generates unique uids across 50 consecutive invocations within the same frozen millisecond", () => {
    const generatedUids = new Set<string>();

    for (let i = 0; i < 50; i++) {
      const builder = new CalendarEventBuilder();
      builder.setUsers([mockUser]);
      builder.calendarEvent.startTime = "2026-11-30T09:00:00Z";
      builder.buildUIDCalendarEvent();
      if (builder.calendarEvent.uid) {
        generatedUids.add(builder.calendarEvent.uid);
      }
    }

    expect(generatedUids.size).toBe(50);
  });
});
