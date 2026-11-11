import type { TFunction } from "i18next";
import { createEvent } from "ics";
import { RRule } from "rrule";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import dayjs from "@calcom/dayjs";
import { parseRecurringEvent } from "@calcom/lib/isRecurringEvent";

import { getCalendarLinks, CalendarLinkType } from "./getCalendarLinks";

// Mock dependencies
vi.mock("ics", () => ({
  createEvent: vi.fn(),
}));

vi.mock("@calcom/lib/isRecurringEvent", () => ({
  parseRecurringEvent: vi.fn(),
}));

describe("getCalendarLinks", () => {
  // Mock data for tests
  const mockStartTime = new Date("2023-01-15T10:00:00Z");
  const mockEndTime = new Date("2023-01-15T11:00:00Z");
  const mockDayjsStartTime = dayjs(mockStartTime);
  const mockDayjsEndTime = dayjs(mockEndTime);

  // Mock translation function
  const mockT = ((key: string) => key) as TFunction;

  // Mock createEvent implementation
  const mockIcsValue = "BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR";

  // Baseline mock objects that can be reused across tests
  const baseMockBooking = {
    startTime: mockStartTime,
    endTime: mockEndTime,
    location: "Test Location",
    title: "Test Title",
    responses: {},
    metadata: {},
  };

  const baseMockEventType = {
    recurringEvent: {},
    description: "Test Description",
    eventName: "Test Event",
    isDynamic: false,
    length: 60,
    team: null,
    users: [{ name: "Test User" }],
    title: "Test Title",
  };

  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks();

    // Default mock implementations
    (createEvent as jest.Mock).mockReturnValue({ value: mockIcsValue });
    (parseRecurringEvent as jest.Mock).mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should return all calendar links", async () => {
    const result = getCalendarLinks({ booking: baseMockBooking, eventType: baseMockEventType, t: mockT });
    const googleLink = result.find((link) => link.id === CalendarLinkType.GOOGLE_CALENDAR);
    const microsoftOfficeLink = result.find((link) => link.id === CalendarLinkType.MICROSOFT_OFFICE);
    const microsoftOutlookLink = result.find((link) => link.id === CalendarLinkType.MICROSOFT_OUTLOOK);
    const icsLink = result.find((link) => link.id === CalendarLinkType.ICS);

    expect(result).toHaveLength(4);
    expect(googleLink).toBeDefined();
    expect(microsoftOfficeLink).toBeDefined();
    expect(microsoftOutlookLink).toBeDefined();
    expect(icsLink).toBeDefined();

    (function verifyGoogleLink() {
      expect(googleLink?.link).toContain("https://calendar.google.com/calendar/r/eventedit");
      expect(googleLink?.link).toContain("dates=");
      expect(googleLink?.link).toContain(
        `${mockDayjsStartTime.utc().format("YYYYMMDDTHHmmss[Z]")}/${mockDayjsEndTime
          .utc()
          .format("YYYYMMDDTHHmmss[Z]")}`
      );
      expect(googleLink?.link).toContain(`details=${encodeURIComponent(baseMockEventType.description)}`);
    })();

    (function verifyMicrosoftOfficeLink() {
      expect(microsoftOfficeLink?.link).toContain("https://outlook.office.com/calendar/0/deeplink/compose");
      expect(microsoftOfficeLink?.link).toContain("enddt=");
      expect(microsoftOfficeLink?.link).toContain("startdt=");
      expect(microsoftOfficeLink?.link).toContain("body=Test%20Description");
    })();

    (function verifymicrosoftOutlookLink() {
      expect(microsoftOutlookLink?.link).toContain("https://outlook.live.com/calendar/0/deeplink/compose");
      expect(microsoftOutlookLink?.link).toContain("enddt=");
      expect(microsoftOutlookLink?.link).toContain("startdt=");
      expect(microsoftOutlookLink?.link).toContain("body=Test%20Description");
    })();

    (function verifyIcsLink() {
      expect(icsLink).toBeDefined();
      expect(icsLink?.link).toContain("data:text/calendar");
      expect(icsLink?.link).toContain(encodeURIComponent(mockIcsValue));
      expect(createEvent).toHaveBeenCalled();
      expect(createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          description: baseMockEventType.description,
        })
      );
    })();
  });

  it("should use videoCallUrl from metadata when available", async () => {
    const videoCallUrl = "https://zoom.com/test";
    const booking = {
      ...baseMockBooking,
      metadata: { videoCallUrl },
    };

    const result = getCalendarLinks({ booking, eventType: baseMockEventType, t: mockT });

    // Check that all links contain the videoCallUrl
    const googleLink = result.find((link) => link.id === CalendarLinkType.GOOGLE_CALENDAR);
    const microsoftOfficeLink = result.find((link) => link.id === CalendarLinkType.MICROSOFT_OFFICE);
    const microsoftOutlookLink = result.find((link) => link.id === CalendarLinkType.MICROSOFT_OUTLOOK);

    expect(googleLink?.link).toContain(`location=${encodeURIComponent(videoCallUrl)}`);
    expect(microsoftOfficeLink?.link).toContain(`location=${encodeURIComponent(videoCallUrl)}`);
    expect(microsoftOutlookLink?.link).toContain(`location=${encodeURIComponent(videoCallUrl)}`);
  });

  it("should handle custom title from dynamic event", async () => {
    const customTitle = "Custom Dynamic Title";
    const booking = {
      ...baseMockBooking,
      responses: { title: customTitle, name: "Test Attendee" },
    };

    const eventType = {
      ...baseMockEventType,
      isDynamic: true, // This makes it use the custom title
    };

    const result = getCalendarLinks({ booking, eventType, t: mockT });

    const googleLink = result.find((link) => link.id === CalendarLinkType.GOOGLE_CALENDAR);
    expect(googleLink?.link).toContain(`details=${encodeURIComponent(eventType.description)}`);
    expect(googleLink?.link).toContain(`text=${encodeURIComponent(customTitle)}`);

    // Check Office 365 link
    const microsoftOfficeLink = result.find((link) => link.id === CalendarLinkType.MICROSOFT_OFFICE);
    expect(microsoftOfficeLink?.link).toContain("body=Test%20Description");
    expect(microsoftOfficeLink?.link).toContain(`subject=${encodeURIComponent(customTitle)}`);

    // Check Outlook link
    const microsoftOutlookLink = result.find((link) => link.id === CalendarLinkType.MICROSOFT_OUTLOOK);
    expect(microsoftOutlookLink?.link).toContain("body=Test%20Description");
    expect(microsoftOutlookLink?.link).toContain(`subject=${encodeURIComponent(customTitle)}`);
  });

  it("should handle recurring events - Only Google Calendar supports at the moment", async () => {
    // Mock a recurring event rule
    const mockRecurringRule = {
      freq: 2, // WEEKLY
      interval: 1,
      count: 5,
    };

    (parseRecurringEvent as jest.Mock).mockReturnValue(mockRecurringRule);

    const eventType = {
      ...baseMockEventType,
      recurringEvent: { count: 5, freq: 2, interval: 1 },
    };

    const mockRRuleString = "FREQ=WEEKLY;INTERVAL=1;COUNT=5";
    vi.spyOn(RRule.prototype, "toString").mockReturnValue(mockRRuleString);

    const result = getCalendarLinks({ booking: baseMockBooking, eventType, t: mockT });
    const googleLink = result.find((link) => link.id === "googleCalendar");

    expect(googleLink).toBeDefined();
    expect(googleLink?.link).toContain(`recur=${encodeURIComponent(mockRRuleString)}`);
  });

  it("should handle error in ICS generation", async () => {
    // Mock createEvent to return an error
    (createEvent as jest.Mock).mockReturnValue({ error: new Error("ICS generation failed") });

    // Mock console.error to avoid test output noise
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = getCalendarLinks({ booking: baseMockBooking, eventType: baseMockEventType, t: mockT });
    const icsLink = result.find((link) => link.id === "ics");

    expect(icsLink).toBeDefined();
    expect(icsLink?.link).toBe("");
    expect(consoleErrorSpy).toHaveBeenCalled();

    // Verify createEvent was called with the correct description
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        description: baseMockEventType.description,
      })
    );

    consoleErrorSpy.mockRestore();
  });

  it("should correctly encode event title and description with special characters (&, #, +, =)", async () => {
    const specialTitle = "Q&A #1 + 100% é";
    const specialDescription = "Discussion about a&b=c #review";
    const specialLocation = "Room #4 & Lounge";

    const booking = {
      ...baseMockBooking,
      location: specialLocation,
    };

    const eventType = {
      ...baseMockEventType,
      eventName: specialTitle,
      description: specialDescription,
    };

    const result = getCalendarLinks({ booking, eventType, t: mockT });

    const googleLink = result.find((link) => link.id === CalendarLinkType.GOOGLE_CALENDAR);
    const officeLink = result.find((link) => link.id === CalendarLinkType.MICROSOFT_OFFICE);
    const outlookLink = result.find((link) => link.id === CalendarLinkType.MICROSOFT_OUTLOOK);

    // Verify title and description are properly URI encoded across all calendar providers
    expect(googleLink?.link).toContain(`text=${encodeURIComponent(specialTitle)}`);
    expect(googleLink?.link).toContain(`details=${encodeURIComponent(specialDescription)}`);
    expect(googleLink?.link).toContain(`location=${encodeURIComponent(specialLocation)}`);

    expect(officeLink?.link).toContain(`subject=${encodeURIComponent(specialTitle)}`);
    expect(officeLink?.link).toContain(`body=${encodeURIComponent(specialDescription)}`);
    expect(officeLink?.link).toContain(`location=${encodeURIComponent(specialLocation)}`);

    expect(outlookLink?.link).toContain(`subject=${encodeURIComponent(specialTitle)}`);
    expect(outlookLink?.link).toContain(`body=${encodeURIComponent(specialDescription)}`);
    expect(outlookLink?.link).toContain(`location=${encodeURIComponent(specialLocation)}`);

    // Verify URLSearchParams parses without parameter truncation or fragment leakage
    const googleUrl = new URL(googleLink!.link);
    expect(googleUrl.searchParams.get("text")).toBe(specialTitle);
    expect(googleUrl.searchParams.get("details")).toBe(specialDescription);
    expect(googleUrl.hash).toBe("");

    const officeUrl = new URL(officeLink!.link);
    expect(officeUrl.searchParams.get("subject")).toBe(specialTitle);
    expect(officeUrl.searchParams.get("body")).toBe(specialDescription);
    expect(officeUrl.hash).toBe("");

    const outlookUrl = new URL(outlookLink!.link);
    expect(outlookUrl.searchParams.get("subject")).toBe(specialTitle);
    expect(outlookUrl.searchParams.get("body")).toBe(specialDescription);
    expect(outlookUrl.hash).toBe("");
  });
});
