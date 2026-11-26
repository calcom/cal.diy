import type { AdditionalInformation, AppsStatus, CalendarEvent } from "@calcom/types/Calendar";
import type { EventResult } from "@calcom/types/EventManager";
import { describe, expect, it } from "vitest";
import { handleAppsStatus } from "./handleAppsStatus";

describe("handleAppsStatus", () => {
  it("should aggregate failures when merging with existing reqAppsStatus", () => {
    const existingReqAppsStatus: AppsStatus[] = [
      {
        appName: "Google Calendar",
        type: "google_calendar",
        success: 1,
        failures: 0,
        errors: [],
        warnings: [],
      },
    ];

    const results: EventResult<AdditionalInformation>[] = [
      {
        appName: "Google Calendar",
        type: "google_calendar",
        success: false,
        uid: "event-uid-1",
        originalEvent: {} as CalendarEvent,
        calError: "Calendar API error",
        calWarnings: ["Token expired"],
      },
    ];

    const aggregated = handleAppsStatus(results, null, existingReqAppsStatus);

    expect(aggregated).toEqual([
      expect.objectContaining({
        appName: "Google Calendar",
        type: "google_calendar",
        success: 1,
        failures: 1,
        errors: ["Calendar API error"],
        warnings: ["Token expired"],
      }),
    ]);
  });

  it("should return correct status when reqAppsStatus is undefined", () => {
    const results: EventResult<AdditionalInformation>[] = [
      {
        appName: "Google Calendar",
        type: "google_calendar",
        success: false,
        uid: "event-uid-2",
        originalEvent: {} as CalendarEvent,
        calError: "Calendar API error",
      },
    ];

    const status = handleAppsStatus(results, null, undefined);

    expect(status).toEqual([
      expect.objectContaining({
        appName: "Google Calendar",
        type: "google_calendar",
        success: 0,
        failures: 1,
        errors: ["Calendar API error"],
      }),
    ]);
  });
});
