import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@calcom/lib/logger", () => ({
  default: {
    getSubLogger: () => ({
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    }),
  },
}));

vi.mock("@calcom/lib/crypto", () => ({
  symmetricDecrypt: vi.fn().mockImplementation((text) => {
    if (typeof text === "object") {
      return JSON.stringify(text);
    }
    return text;
  }),
}));

import BuildCalendarService from "./CalendarService";

describe("ICSFeedCalendarService - Issue #30195 Recurring Event Availability", () => {
  const DUBLIN_WEEKLY_ICS = \`BEGIN:VCALENDAR\\r
VERSION:2.0\\r
PRODID:-//Cal.com//NONSGML//EN\\r
BEGIN:VTIMEZONE\\r
TZID:Europe/Dublin\\r
BEGIN:STANDARD\\r
DTSTART:19711031T020000\\r
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU\\r
TZNAME:GMT\\r
TZOFFSETFROM:+0100\\r
TZOFFSETTO:+0000\\r
END:STANDARD\\r
BEGIN:DAYLIGHT\\r
DTSTART:19710328T010000\\r
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU\\r
TZNAME:IST\\r
TZOFFSETFROM:+0000\\r
TZOFFSETTO:+0100\\r
END:DAYLIGHT\\r
END:VTIMEZONE\\r
BEGIN:VEVENT\\r
UID:weekly-tuesday-recurr-123\\r
DTSTART;TZID=Europe/Dublin:20260818T130000\\r
DTEND;TZID=Europe/Dublin:20260818T140000\\r
RRULE:FREQ=WEEKLY\\r
SUMMARY:Weekly Tuesday Sync\\r
END:VEVENT\\r
END:VCALENDAR\`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves weekly recurrence anchor and agrees across broad and narrow query windows", async () => {
    const icsService = BuildCalendarService({
      id: 1,
      type: "ics-feed_calendar",
      userId: 1,
      teamId: null,
      appId: "ics-feedcalendar",
      invalid: false,
      key: JSON.stringify({ urls: ["https://example.com/feed.ics"] }),
    } as never);

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      text: async () => DUBLIN_WEEKLY_ICS,
    } as Response);

    const broadBrowse = await icsService.getAvailability({
      dateFrom: "2026-08-16T00:00:00Z",
      dateTo: "2026-08-23T23:59:59Z",
      selectedCalendars: [],
    });

    const narrowSubmit = await icsService.getAvailability({
      dateFrom: "2026-08-18T00:00:00Z",
      dateTo: "2026-08-18T23:59:59Z",
      selectedCalendars: [],
    });

    expect(broadBrowse).toEqual(narrowSubmit);
    expect(narrowSubmit).toEqual([
      {
        start: "2026-08-18T12:00:00.000Z",
        end: "2026-08-18T13:00:00.000Z",
        title: "Weekly Tuesday Sync",
      },
    ]);
  });
});
