import type { Calendar, EventBusyDate, GetAvailabilityParams } from "@calcom/types/Calendar";
import { describe, expect, test, vi } from "vitest";
import { CalendarTelemetryWrapper } from "../CalendarTelemetryWrapper";

const params: GetAvailabilityParams = {
  dateFrom: "2024-01-10T00:00:00Z",
  dateTo: "2024-01-11T00:00:00Z",
  selectedCalendars: [{ integration: "google_calendar", externalId: "calendar1@test.com" }],
  mode: "overlay",
};
const busyTimes: EventBusyDate[] = [{ start: "2024-01-10T10:00:00Z", end: "2024-01-10T10:30:00Z" }];

const wrap = (originalCalendar: Partial<Calendar>) =>
  new CalendarTelemetryWrapper({
    originalCalendar: originalCalendar as Calendar,
    calendarType: "google",
    cacheSupported: false,
    cacheEnabled: false,
    credentialId: 1,
    mode: "overlay",
  });

describe("CalendarTelemetryWrapper.getAvailabilityWithTitles", () => {
  test("returns the titles of calendars that support them", async () => {
    const busyTimesWithTitles = [{ ...busyTimes[0], title: "Standup" }];
    const getAvailability = vi.fn();
    const getAvailabilityWithTitles = vi.fn().mockResolvedValue(busyTimesWithTitles);

    const result = await wrap({ getAvailability, getAvailabilityWithTitles }).getAvailabilityWithTitles(
      params
    );

    expect(result).toEqual(busyTimesWithTitles);
    expect(getAvailabilityWithTitles).toHaveBeenCalledWith(params);
    expect(getAvailability).not.toHaveBeenCalled();
  });

  test("falls back to getAvailability for calendars that can't provide titles", async () => {
    const getAvailability = vi.fn().mockResolvedValue(busyTimes);

    const result = await wrap({ getAvailability }).getAvailabilityWithTitles(params);

    expect(result).toEqual(busyTimes);
  });
});
