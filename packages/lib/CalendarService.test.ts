import { createEvent as createIcsEvent } from "ics";
import { createCalendarObject, updateCalendarObject } from "tsdav";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ics", () => ({
  createEvent: vi.fn(),
}));

vi.mock("tsdav", () => ({
  createAccount: vi.fn(),
  fetchCalendars: vi.fn(),
  fetchCalendarObjects: vi.fn(),
  createCalendarObject: vi.fn().mockResolvedValue({ ok: true }),
  updateCalendarObject: vi.fn().mockResolvedValue({ status: 200 }),
  deleteCalendarObject: vi.fn(),
  getBasicAuthHeaders: vi.fn().mockReturnValue({}),
}));

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

vi.mock("./CalEventParser", () => ({
  getLocation: vi.fn().mockReturnValue("Test Location"),
  getRichDescription: vi.fn().mockReturnValue("Test Description"),
}));

import type { CalendarServiceEvent } from "@calcom/types/Calendar";
import BaseCalendarService, {
  ensureTrailingSlash,
  joinCalDavObjectUrl,
  matchesCalDavBookingObject,
} from "./CalendarService";

const createMockEvent = (overrides: Partial<CalendarServiceEvent> = {}): CalendarServiceEvent => ({
  type: "caldav",
  title: "Test Event",
  startTime: "2023-01-01T10:00:00Z",
  endTime: "2023-01-01T11:00:00Z",
  organizer: {
    name: "Test",
    email: "test@example.com",
    timeZone: "UTC",
    language: { translate: ((key: string) => key) as never, locale: "en" },
  },
  attendees: [],
  calendarDescription: "Test Description",
  ...overrides,
});

class TestCalendarService extends BaseCalendarService {
  constructor() {
    super(
      {
        id: 1,
        type: "caldav_calendar",
        delegationCredentialId: null,
        user: { email: "test@example.com" },
        userId: 1,
        teamId: null,
        appId: "caldav",
        invalid: false,
        key: {
          username: "test",
          password: "test",
          url: "https://caldav.example.com",
        },
      },
      "caldav",
      "https://caldav.example.com"
    );
  }

  async listCalendars() {
    return [
      {
        externalId: "https://caldav.example.com/calendar/",
        name: "Test Calendar",
        primary: true,
        readOnly: false,
        email: "test@example.com",
        integrationName: "caldav",
        credentialId: 1,
      },
    ];
  }

  async testUpdateEvent(uid: string, event: CalendarServiceEvent, externalCalendarId: string) {
    return this.updateEvent(uid, event);
  }
}

describe("CalendarService - UID Consistency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should use event.uid when provided, not generate a new UUID", async () => {
    const service = new TestCalendarService();
    const bookingUid = "booking-uid-from-database-abc123";
    const mockIcsOutput = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:${bookingUid}\r\nDTSTART:20230615T150000Z\r\nDTEND:20230615T160000Z\r\nEND:VEVENT\r\nEND:VCALENDAR`;

    vi.mocked(createIcsEvent).mockReturnValue({
      error: null as unknown as Error,
      value: mockIcsOutput,
    });

    const event = createMockEvent({ uid: bookingUid });
    const result = await service.createEvent(event, 1);

    expect(result.uid).toBe(bookingUid);
    expect(result.id).toBe(bookingUid);

    const calledArg = vi.mocked(createCalendarObject).mock.calls[0][0];
    expect(calledArg.filename).toBe(`${bookingUid}.ics`);

    const icsCallArg = vi.mocked(createIcsEvent).mock.calls[0][0];
    expect(icsCallArg.uid).toBe(bookingUid);
  });

  it("should generate a new UUID when event.uid is not provided", async () => {
    const service = new TestCalendarService();
    const mockIcsOutput = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:generated-uuid\r\nDTSTART:20230615T150000Z\r\nDTEND:20230615T160000Z\r\nEND:VEVENT\r\nEND:VCALENDAR`;

    vi.mocked(createIcsEvent).mockReturnValue({
      error: null as unknown as Error,
      value: mockIcsOutput,
    });

    const event = createMockEvent({ uid: undefined });
    const result = await service.createEvent(event, 1);

    expect(result.uid).toBeTruthy();
    expect(typeof result.uid).toBe("string");
    expect(result.uid.length).toBeGreaterThan(0);
  });

  it("should use the same uid for CalDAV filename and ics UID property", async () => {
    const service = new TestCalendarService();
    const bookingUid = "consistent-uid-xyz789";
    const mockIcsOutput = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:${bookingUid}\r\nDTSTART:20230615T150000Z\r\nDTEND:20230615T160000Z\r\nEND:VEVENT\r\nEND:VCALENDAR`;

    vi.mocked(createIcsEvent).mockReturnValue({
      error: null as unknown as Error,
      value: mockIcsOutput,
    });

    const event = createMockEvent({ uid: bookingUid });
    await service.createEvent(event, 1);

    const icsCallArg = vi.mocked(createIcsEvent).mock.calls[0][0];
    const calledArg = vi.mocked(createCalendarObject).mock.calls[0][0];

    expect(icsCallArg.uid).toBe(bookingUid);
    expect(calledArg.filename).toBe(`${bookingUid}.ics`);
    expect(icsCallArg.uid).toBe(calledArg.filename?.replace(".ics", ""));
  });
});

describe("CalendarService - VTIMEZONE Generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should include VTIMEZONE block in created CalDAV event", async () => {
    const service = new TestCalendarService();
    const mockIcsOutput = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:test-uid\r\nDTSTART:20230615T150000Z\r\nDURATION:PT1H\r\nEND:VEVENT\r\nEND:VCALENDAR`;

    vi.mocked(createIcsEvent).mockReturnValue({
      error: null as unknown as Error,
      value: mockIcsOutput,
    });

    const event = createMockEvent({
      startTime: "2023-06-15T15:00:00Z",
      endTime: "2023-06-15T16:00:00Z",
      organizer: {
        name: "Test",
        email: "test@example.com",
        timeZone: "America/Chicago",
        language: { translate: ((key: string) => key) as never, locale: "en" },
      },
    });

    await service.createEvent(event, 1);

    const calledArg = vi.mocked(createCalendarObject).mock.calls[0][0];
    const iCalString = calledArg.iCalString;

    expect(iCalString).toContain("BEGIN:VTIMEZONE");
    expect(iCalString).toContain("END:VTIMEZONE");
    expect(iCalString).toContain("TZID:America/Chicago");
  });

  it("should use TZID in DTSTART instead of UTC Z suffix", async () => {
    const service = new TestCalendarService();
    const mockIcsOutput = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:test-uid\r\nDTSTART:20230615T150000Z\r\nDURATION:PT1H\r\nEND:VEVENT\r\nEND:VCALENDAR`;

    vi.mocked(createIcsEvent).mockReturnValue({
      error: null as unknown as Error,
      value: mockIcsOutput,
    });

    const event = createMockEvent({
      startTime: "2023-06-15T15:00:00Z",
      endTime: "2023-06-15T16:00:00Z",
      organizer: {
        name: "Test",
        email: "test@example.com",
        timeZone: "America/Chicago",
        language: { translate: ((key: string) => key) as never, locale: "en" },
      },
    });

    await service.createEvent(event, 1);

    const calledArg = vi.mocked(createCalendarObject).mock.calls[0][0];
    const iCalString = calledArg.iCalString;

    expect(iCalString).toContain("DTSTART;TZID=America/Chicago:");
    const unfolded = iCalString.replace(/\r?\n[ \t]/g, "");
    expect(unfolded).not.toMatch(/^DTSTART:[0-9]{8}T[0-9]{6}Z/m);
  });

  it("should convert UTC time to local time correctly for America/Chicago", async () => {
    const service = new TestCalendarService();
    // 2023-01-15T15:00:00Z = 2023-01-15T09:00:00 in America/Chicago (UTC-6 in January)
    const mockIcsOutput = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:test-uid\r\nDTSTART:20230115T150000Z\r\nDURATION:PT1H\r\nEND:VEVENT\r\nEND:VCALENDAR`;

    vi.mocked(createIcsEvent).mockReturnValue({
      error: null as unknown as Error,
      value: mockIcsOutput,
    });

    const event = createMockEvent({
      startTime: "2023-01-15T15:00:00Z",
      endTime: "2023-01-15T16:00:00Z",
      organizer: {
        name: "Test",
        email: "test@example.com",
        timeZone: "America/Chicago",
        language: { translate: ((key: string) => key) as never, locale: "en" },
      },
    });

    await service.createEvent(event, 1);

    const calledArg = vi.mocked(createCalendarObject).mock.calls[0][0];
    const iCalString = calledArg.iCalString;
    const unfolded = iCalString.replace(/\r?\n[ \t]/g, "");

    expect(unfolded).toContain("DTSTART;TZID=America/Chicago:20230115T090000");
  });

  it("should place VTIMEZONE block before BEGIN:VEVENT", async () => {
    const service = new TestCalendarService();
    const mockIcsOutput = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:test-uid\r\nDTSTART:20230615T150000Z\r\nDURATION:PT1H\r\nEND:VEVENT\r\nEND:VCALENDAR`;

    vi.mocked(createIcsEvent).mockReturnValue({
      error: null as unknown as Error,
      value: mockIcsOutput,
    });

    const event = createMockEvent({
      startTime: "2023-06-15T15:00:00Z",
      endTime: "2023-06-15T16:00:00Z",
      organizer: {
        name: "Test",
        email: "test@example.com",
        timeZone: "America/Chicago",
        language: { translate: ((key: string) => key) as never, locale: "en" },
      },
    });
    await service.createEvent(event, 1);

    const calledArg = vi.mocked(createCalendarObject).mock.calls[0][0];
    const iCalString = calledArg.iCalString;

    const vtimezoneIdx = iCalString.indexOf("BEGIN:VTIMEZONE");
    const veventIdx = iCalString.indexOf("BEGIN:VEVENT");

    expect(vtimezoneIdx).toBeGreaterThan(-1);
    expect(veventIdx).toBeGreaterThan(-1);
    expect(vtimezoneIdx).toBeLessThan(veventIdx);
  });

  it("should produce valid 8-digit DTSTART dates in VTIMEZONE blocks", async () => {
    const service = new TestCalendarService();
    const mockIcsOutput = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:test-uid\r\nDTSTART:20230615T120000Z\r\nDURATION:PT1H\r\nEND:VEVENT\r\nEND:VCALENDAR`;

    vi.mocked(createIcsEvent).mockReturnValue({
      error: null as unknown as Error,
      value: mockIcsOutput,
    });

    const event = createMockEvent({
      startTime: "2023-06-15T12:00:00Z",
      endTime: "2023-06-15T13:00:00Z",
      organizer: {
        name: "Test",
        email: "test@example.com",
        timeZone: "America/New_York",
        language: { translate: ((key: string) => key) as never, locale: "en" },
      },
    });

    await service.createEvent(event, 1);

    const calledArg = vi.mocked(createCalendarObject).mock.calls[0][0];
    const iCalString = calledArg.iCalString;

    const vtimezoneBlock = iCalString.slice(
      iCalString.indexOf("BEGIN:VTIMEZONE"),
      iCalString.indexOf("END:VTIMEZONE") + 13
    );
    const dtStartMatches = vtimezoneBlock.match(/DTSTART:(\d+)T/g);
    expect(dtStartMatches).not.toBeNull();
    for (const match of dtStartMatches ?? []) {
      const dateStr = match.replace("DTSTART:", "").replace("T", "");
      expect(dateStr).toHaveLength(8); // YYYYMMDD = 8 chars
    }
  });

  it("should use pre-transition local time for VTIMEZONE DTSTART (RFC 5545)", async () => {
    const service = new TestCalendarService();
    const mockIcsOutput = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:test-uid\r\nDTSTART:20230615T120000Z\r\nDURATION:PT1H\r\nEND:VEVENT\r\nEND:VCALENDAR`;

    vi.mocked(createIcsEvent).mockReturnValue({
      error: null as unknown as Error,
      value: mockIcsOutput,
    });

    const event = createMockEvent({
      startTime: "2023-06-15T12:00:00Z",
      endTime: "2023-06-15T13:00:00Z",
      organizer: {
        name: "Test",
        email: "test@example.com",
        timeZone: "America/New_York",
        language: { translate: ((key: string) => key) as never, locale: "en" },
      },
    });

    await service.createEvent(event, 1);

    const calledArg = vi.mocked(createCalendarObject).mock.calls[0][0];
    const iCalString = calledArg.iCalString;

    const vtimezoneBlock = iCalString.slice(
      iCalString.indexOf("BEGIN:VTIMEZONE"),
      iCalString.indexOf("END:VTIMEZONE") + 13
    );

    // America/New_York 2023: spring forward March 12 at 2:00 AM EST,
    // fall back November 5 at 2:00 AM EDT.
    // RFC 5545 requires DTSTART to use pre-transition local time (02:00),
    // not the post-transition time (03:00 for spring forward, 01:00 for fall back).
    const daylightBlock = vtimezoneBlock.slice(
      vtimezoneBlock.indexOf("BEGIN:DAYLIGHT"),
      vtimezoneBlock.indexOf("END:DAYLIGHT")
    );
    expect(daylightBlock).toContain("DTSTART:20230312T020000");

    const standardBlock = vtimezoneBlock.slice(
      vtimezoneBlock.indexOf("BEGIN:STANDARD"),
      vtimezoneBlock.indexOf("END:STANDARD")
    );
    expect(standardBlock).toContain("DTSTART:20231105T020000");
  });

  it("should use correct DST rules for Southern Hemisphere (Australia/Sydney)", async () => {
    const service = new TestCalendarService();
    const mockIcsOutput = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:test-uid\r\nDTSTART:20230115T020000Z\r\nDURATION:PT1H\r\nEND:VEVENT\r\nEND:VCALENDAR`;

    vi.mocked(createIcsEvent).mockReturnValue({
      error: null as unknown as Error,
      value: mockIcsOutput,
    });

    const event = createMockEvent({
      startTime: "2023-01-15T02:00:00Z",
      endTime: "2023-01-15T03:00:00Z",
      organizer: {
        name: "Test",
        email: "test@example.com",
        timeZone: "Australia/Sydney",
        language: { translate: ((key: string) => key) as never, locale: "en" },
      },
    });

    await service.createEvent(event, 1);

    const calledArg = vi.mocked(createCalendarObject).mock.calls[0][0];
    const iCalString = calledArg.iCalString;

    expect(iCalString).toContain("BEGIN:VTIMEZONE");
    expect(iCalString).toContain("TZID:Australia/Sydney");
    const vtimezoneBlock = iCalString.slice(
      iCalString.indexOf("BEGIN:VTIMEZONE"),
      iCalString.indexOf("END:VTIMEZONE") + 13
    );
    expect(vtimezoneBlock).toContain("BEGIN:DAYLIGHT");
    expect(vtimezoneBlock).toContain("BEGIN:STANDARD");
  });

  it("should apply timezone fix to updateEvent as well", async () => {
    const service = new TestCalendarService();
    const mockIcsOutput = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:test-uid\r\nDTSTART:20230615T150000Z\r\nATTENDEE;CN=Guest:mailto:guest@example.com\r\nDURATION:PT1H\r\nEND:VEVENT\r\nEND:VCALENDAR`;

    vi.mocked(createIcsEvent).mockReturnValue({
      error: null as unknown as Error,
      value: mockIcsOutput,
    });

    (service as unknown as Record<string, unknown>).getEventsByUID = vi.fn().mockResolvedValue([
      {
        uid: "test-uid",
        url: "https://caldav.example.com/calendar/test.ics",
        etag: '"etag123"',
      },
    ]);

    const event = createMockEvent({
      uid: "test-uid",
      startTime: "2023-06-15T15:00:00Z",
      endTime: "2023-06-15T16:00:00Z",
      organizer: {
        name: "Test",
        email: "test@example.com",
        timeZone: "America/Chicago",
        language: { translate: ((key: string) => key) as never, locale: "en" },
      },
    });

    await service.testUpdateEvent("test-uid", event, "https://caldav.example.com/calendar/");

    const calledArg = vi.mocked(updateCalendarObject).mock.calls[0][0];
    const data = calledArg.calendarObject.data;

    expect(data).toContain("BEGIN:VTIMEZONE");
    expect(data).toContain("TZID:America/Chicago");
    expect(data).toContain("DTSTART;TZID=America/Chicago:");
  });
});

describe("CalendarService - SCHEDULE-AGENT injection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("injectScheduleAgent", () => {
    it("should inject SCHEDULE-AGENT=CLIENT into ATTENDEE lines", async () => {
      const service = new TestCalendarService();
      const mockIcsOutput = `BEGIN:VCALENDAR\r\nMETHOD:PUBLISH\r\nATTENDEE;CN=Guest:mailto:guest@example.com\r\nEND:VCALENDAR`;
      vi.mocked(createIcsEvent).mockReturnValue({
        error: null as unknown as Error,
        value: mockIcsOutput,
      });

      const event = createMockEvent();

      await service.createEvent(event, 1);

      const calledArg = vi.mocked(createCalendarObject).mock.calls[0][0];
      const iCalString = calledArg.iCalString;
      const unfolded = iCalString.replace(/\r?\n[ \t]/g, "");

      expect(unfolded).toContain("ATTENDEE;CN=Guest;SCHEDULE-AGENT=CLIENT:mailto:guest@example.com");
      expect(unfolded).not.toContain("METHOD:PUBLISH");
    });

    it("should inject SCHEDULE-AGENT=CLIENT into ORGANIZER lines", async () => {
      const service = new TestCalendarService();
      const mockIcsOutput = `BEGIN:VCALENDAR\r\nORGANIZER;CN=Test:mailto:test@example.com\r\nATTENDEE;CN=Guest:mailto:guest@example.com\r\nEND:VCALENDAR`;
      vi.mocked(createIcsEvent).mockReturnValue({
        error: null as unknown as Error,
        value: mockIcsOutput,
      });

      const event = createMockEvent();

      await service.createEvent(event, 1);

      const calledArg = vi.mocked(createCalendarObject).mock.calls[0][0];
      const iCalString = calledArg.iCalString;
      const unfolded = iCalString.replace(/\r?\n[ \t]/g, "");

      expect(unfolded).toContain("ORGANIZER;CN=Test;SCHEDULE-AGENT=CLIENT:mailto:test@example.com");
      expect(unfolded).toContain("ATTENDEE;CN=Guest;SCHEDULE-AGENT=CLIENT:mailto:guest@example.com");
    });

    it("should not duplicate SCHEDULE-AGENT if already present", async () => {
      const service = new TestCalendarService();
      const mockIcsOutput = `BEGIN:VCALENDAR\r\nATTENDEE;SCHEDULE-AGENT=SERVER;CN=Guest:mailto:guest@example.com\r\nEND:VCALENDAR`;
      vi.mocked(createIcsEvent).mockReturnValue({
        error: null as unknown as Error,
        value: mockIcsOutput,
      });

      const event = createMockEvent();

      await service.createEvent(event, 1);

      const calledArg = vi.mocked(createCalendarObject).mock.calls[0][0];
      const iCalString = calledArg.iCalString;

      const scheduleAgentCount = (iCalString.match(/SCHEDULE-AGENT/g) || []).length;
      expect(scheduleAgentCount).toBe(1);
    });

    it("should handle quoted colons in CN parameter", async () => {
      const service = new TestCalendarService();
      const mockIcsOutput = `BEGIN:VCALENDAR\r\nATTENDEE;CN="John: CEO":mailto:john@example.com\r\nEND:VCALENDAR`;
      vi.mocked(createIcsEvent).mockReturnValue({
        error: null as unknown as Error,
        value: mockIcsOutput,
      });

      const event = createMockEvent();

      await service.createEvent(event, 1);

      const calledArg = vi.mocked(createCalendarObject).mock.calls[0][0];
      const iCalString = calledArg.iCalString;
      const unfolded = iCalString.replace(/\r?\n[ \t]/g, "");

      expect(unfolded).toContain('ATTENDEE;CN="John: CEO";SCHEDULE-AGENT=CLIENT:mailto:john@example.com');
    });

    it("should remove METHOD:PUBLISH per RFC 4791", async () => {
      const service = new TestCalendarService();
      const mockIcsOutput = `BEGIN:VCALENDAR\r\nMETHOD:PUBLISH\r\nATTENDEE;CN=Guest:mailto:guest@example.com\r\nEND:VCALENDAR`;
      vi.mocked(createIcsEvent).mockReturnValue({
        error: null as unknown as Error,
        value: mockIcsOutput,
      });

      const event = createMockEvent();

      await service.createEvent(event, 1);

      const calledArg = vi.mocked(createCalendarObject).mock.calls[0][0];
      const iCalString = calledArg.iCalString;

      expect(iCalString).not.toContain("METHOD:PUBLISH");
    });

    it("should handle case-insensitive ATTENDEE matching", async () => {
      const service = new TestCalendarService();
      const mockIcsOutput = `BEGIN:VCALENDAR\r\nattendee;cn=Guest:mailto:guest@example.com\r\nEND:VCALENDAR`;
      vi.mocked(createIcsEvent).mockReturnValue({
        error: null as unknown as Error,
        value: mockIcsOutput,
      });

      const event = createMockEvent();

      await service.createEvent(event, 1);

      const calledArg = vi.mocked(createCalendarObject).mock.calls[0][0];
      const iCalString = calledArg.iCalString;
      const unfolded = iCalString.replace(/\r?\n[ \t]/g, "");

      expect(unfolded).toContain("SCHEDULE-AGENT=CLIENT");
    });
  });

  describe("RFC 5545 Line Folding", () => {
    it("should fold long lines at 75 octets", async () => {
      const service = new TestCalendarService();
      const longName = "A".repeat(60);
      const mockIcsOutput = `BEGIN:VCALENDAR\r\nATTENDEE;CN=${longName}:mailto:guest@example.com\r\nEND:VCALENDAR`;
      vi.mocked(createIcsEvent).mockReturnValue({
        error: null as unknown as Error,
        value: mockIcsOutput,
      });

      const event = createMockEvent();

      await service.createEvent(event, 1);

      const calledArg = vi.mocked(createCalendarObject).mock.calls[0][0];
      const iCalString = calledArg.iCalString;
      const lines = iCalString.split("\r\n");

      lines.forEach((line) => {
        const byteLength = new TextEncoder().encode(line).length;
        expect(byteLength).toBeLessThanOrEqual(75);
      });
    });

    it("should handle UTF-8 multi-byte characters correctly", async () => {
      const service = new TestCalendarService();
      const unicodeName = "\u4E2D".repeat(30);
      const mockIcsOutput = `BEGIN:VCALENDAR\r\nORGANIZER;CN=${unicodeName}:mailto:test@example.com\r\nEND:VCALENDAR`;
      vi.mocked(createIcsEvent).mockReturnValue({
        error: null as unknown as Error,
        value: mockIcsOutput,
      });

      const event = createMockEvent();

      await service.createEvent(event, 1);

      const calledArg = vi.mocked(createCalendarObject).mock.calls[0][0];
      const iCalString = calledArg.iCalString;
      const lines = iCalString.split("\r\n");

      lines.forEach((line) => {
        const byteLength = new TextEncoder().encode(line).length;
        expect(byteLength).toBeLessThanOrEqual(75);
      });

      const unfolded = iCalString.replace(/\r?\n[ \t]/g, "");
      expect(unfolded).toContain("SCHEDULE-AGENT=CLIENT");
    });

    it("should handle folded input lines correctly", async () => {
      const service = new TestCalendarService();
      const mockIcsOutput = `BEGIN:VCALENDAR\r\nATTENDEE;CN=Very Long Name That Will Be\r\n  Folded:mailto:guest@example.com\r\nEND:VCALENDAR`;
      vi.mocked(createIcsEvent).mockReturnValue({
        error: null as unknown as Error,
        value: mockIcsOutput,
      });

      const event = createMockEvent();

      await service.createEvent(event, 1);

      const calledArg = vi.mocked(createCalendarObject).mock.calls[0][0];
      const iCalString = calledArg.iCalString;
      const unfolded = iCalString.replace(/\r?\n[ \t]/g, "");

      expect(unfolded).toContain("SCHEDULE-AGENT=CLIENT");
    });
  });

  describe("updateEvent", () => {
    it("should inject SCHEDULE-AGENT=CLIENT on update", async () => {
      const service = new TestCalendarService();
      const mockIcsOutput = `BEGIN:VCALENDAR\r\nATTENDEE;CN=Guest:mailto:guest@example.com\r\nEND:VCALENDAR`;
      vi.mocked(createIcsEvent).mockReturnValue({
        error: null as unknown as Error,
        value: mockIcsOutput,
      });

      (service as unknown as Record<string, unknown>).getEventsByUID = vi.fn().mockResolvedValue([
        {
          uid: "test-uid",
          url: "https://caldav.example.com/calendar/test.ics",
          etag: '"etag123"',
        },
      ]);

      const event = createMockEvent({ uid: "test-uid" });

      await service.testUpdateEvent("test-uid", event, "https://caldav.example.com/calendar/");

      const calledArg = vi.mocked(updateCalendarObject).mock.calls[0][0];
      const data = calledArg.calendarObject.data;
      const unfolded = data.replace(/\r?\n[ \t]/g, "");

      expect(unfolded).toContain("SCHEDULE-AGENT=CLIENT");
    });
  });

  describe("Edge cases", () => {
    it("should handle ATTENDEE with multiple parameters", async () => {
      const service = new TestCalendarService();
      const mockIcsOutput = `BEGIN:VCALENDAR\r\nATTENDEE;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=Guest:mailto:guest@example.com\r\nEND:VCALENDAR`;
      vi.mocked(createIcsEvent).mockReturnValue({
        error: null as unknown as Error,
        value: mockIcsOutput,
      });

      const event = createMockEvent();

      await service.createEvent(event, 1);

      const calledArg = vi.mocked(createCalendarObject).mock.calls[0][0];
      const iCalString = calledArg.iCalString;
      const unfolded = iCalString.replace(/\r?\n[ \t]/g, "");

      expect(unfolded).toContain("PARTSTAT=NEEDS-ACTION");
      expect(unfolded).toContain("RSVP=TRUE");
      expect(unfolded).toContain("SCHEDULE-AGENT=CLIENT");
    });

    it("should handle ATTENDEE with http URI", async () => {
      const service = new TestCalendarService();
      const mockIcsOutput = `BEGIN:VCALENDAR\r\nATTENDEE;CN=Guest:http://example.com/user\r\nEND:VCALENDAR`;
      vi.mocked(createIcsEvent).mockReturnValue({
        error: null as unknown as Error,
        value: mockIcsOutput,
      });

      const event = createMockEvent();

      await service.createEvent(event, 1);

      const calledArg = vi.mocked(createCalendarObject).mock.calls[0][0];
      const iCalString = calledArg.iCalString;
      const unfolded = iCalString.replace(/\r?\n[ \t]/g, "");

      expect(unfolded).toContain("ATTENDEE;CN=Guest;SCHEDULE-AGENT=CLIENT:http://example.com/user");
    });

    it("should preserve other iCal properties unchanged", async () => {
      const service = new TestCalendarService();
      const mockIcsOutput = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Cal.diy//NONSGML//EN\r\nBEGIN:VEVENT\r\nATTENDEE;CN=Guest:mailto:guest@example.com\r\nDTSTART:20230101T100000Z\r\nDTEND:20230101T110000Z\r\nEND:VEVENT\r\nEND:VCALENDAR`;
      vi.mocked(createIcsEvent).mockReturnValue({
        error: null as unknown as Error,
        value: mockIcsOutput,
      });

      const event = createMockEvent();

      await service.createEvent(event, 1);

      const calledArg = vi.mocked(createCalendarObject).mock.calls[0][0];
      const iCalString = calledArg.iCalString;

      expect(iCalString).toContain("VERSION:2.0");
      expect(iCalString).toContain("PRODID:-//Cal.diy//NONSGML//EN");
    });

    it("should handle empty iCalString gracefully", async () => {
      const service = new TestCalendarService();
      vi.mocked(createIcsEvent).mockReturnValue({
        error: null as unknown as Error,
        value: "",
      });

      const event = createMockEvent();

      await expect(service.createEvent(event, 1)).rejects.toThrow();
    });
  });
});

describe("CalDAV collection URL normalization", () => {
  it("ensureTrailingSlash appends a slash when missing", () => {
    expect(ensureTrailingSlash("https://mail.example.com/dav/cal/user/default")).toBe(
      "https://mail.example.com/dav/cal/user/default/"
    );
    expect(ensureTrailingSlash("https://mail.example.com/dav/cal/user/default/")).toBe(
      "https://mail.example.com/dav/cal/user/default/"
    );
  });

  it("joinCalDavObjectUrl matches tsdav createCalendarObject URL resolution", () => {
    // Without normalization, `new URL(filename, collectionWithoutSlash)` would drop the last segment.
    expect(joinCalDavObjectUrl("https://mail.example.com/dav/cal/user/default", "booking-uid.ics")).toBe(
      "https://mail.example.com/dav/cal/user/default/booking-uid.ics"
    );
    expect(joinCalDavObjectUrl("https://mail.example.com/dav/cal/user/default/", "booking-uid.ics")).toBe(
      "https://mail.example.com/dav/cal/user/default/booking-uid.ics"
    );
  });
});

describe("matchesCalDavBookingObject", () => {
  const objectUrl = "https://mail.example.com/dav/cal/user/default/booking-uid.ics";

  it("matches exact ICS UID", () => {
    expect(matchesCalDavBookingObject({ uid: "booking-uid", url: objectUrl }, "booking-uid")).toBe(true);
  });

  it("matches iCalUID forms like bookingUid@Cal.diy", () => {
    expect(
      matchesCalDavBookingObject({ uid: "booking-uid@Cal.diy", url: objectUrl }, "booking-uid")
    ).toBe(true);
    expect(
      matchesCalDavBookingObject({ uid: "booking-uid@example.com", url: objectUrl }, "booking-uid")
    ).toBe(true);
  });

  it("matches by object pathname even when ICS UID differs", () => {
    expect(
      matchesCalDavBookingObject(
        { uid: "totally-different-uid", url: objectUrl },
        "booking-uid"
      )
    ).toBe(true);
  });

  it("does not match unrelated UIDs or substrings in the path", () => {
    expect(
      matchesCalDavBookingObject(
        {
          uid: "other@Cal.diy",
          url: "https://mail.example.com/dav/cal/user/default/other-booking-uid.ics",
        },
        "booking-uid"
      )
    ).toBe(false);
    expect(
      matchesCalDavBookingObject(
        {
          uid: "prefix-booking-uid",
          url: "https://mail.example.com/dav/cal/user/default/prefix-booking-uid.ics",
        },
        "booking-uid"
      )
    ).toBe(false);
  });
});

describe("CalDAV deleteEvent object lookup", () => {
  const uid = "booking-uid-from-database-abc123";
  const calendarWithoutSlash = "https://mail.example.com/dav/cal/user/default";
  const expectedObjectUrl = `${calendarWithoutSlash}/${uid}.ics`;
  const icsBody = `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART:20230615T150000Z\r\nDTEND:20230615T160000Z\r\nEND:VEVENT\r\nEND:VCALENDAR`;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => icsBody,
        headers: { get: (name: string) => (name.toLowerCase() === "etag" ? '"etag-1"' : null) },
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs the object under the collection when externalId has no trailing slash", async () => {
    const { deleteCalendarObject, fetchCalendarObjects } = await import("tsdav");
    const service = new TestCalendarService();

    vi.spyOn(service, "listCalendars").mockResolvedValue([
      {
        externalId: calendarWithoutSlash,
        name: "Stalwart Calendar",
        primary: true,
        readOnly: false,
        email: "paul@example.com",
        integrationName: "caldav",
        credentialId: 1,
      },
    ]);
    vi.mocked(deleteCalendarObject).mockResolvedValue({ status: 204 } as never);

    await service.deleteEvent(uid);

    expect(fetch).toHaveBeenCalledWith(
      expectedObjectUrl,
      expect.objectContaining({
        method: "GET",
      })
    );
    expect(fetchCalendarObjects).not.toHaveBeenCalled();
    expect(deleteCalendarObject).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarObject: expect.objectContaining({
          url: expectedObjectUrl,
        }),
      })
    );
  });

  it("deletes when ICS UID is bookingUid@Cal.diy but filename uses booking uid", async () => {
    const { deleteCalendarObject } = await import("tsdav");
    const service = new TestCalendarService();
    const icsWithDomainUid = `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:${uid}@Cal.diy\r\nDTSTART:20230615T150000Z\r\nDTEND:20230615T160000Z\r\nEND:VEVENT\r\nEND:VCALENDAR`;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => icsWithDomainUid,
        headers: { get: () => '"etag-2"' },
      })
    );

    vi.spyOn(service, "listCalendars").mockResolvedValue([
      {
        externalId: `${calendarWithoutSlash}/`,
        name: "Stalwart Calendar",
        primary: true,
        readOnly: false,
        email: "paul@example.com",
        integrationName: "caldav",
        credentialId: 1,
      },
    ]);
    vi.mocked(deleteCalendarObject).mockResolvedValue({ status: 204 } as never);

    await service.deleteEvent(uid);

    expect(deleteCalendarObject).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarObject: expect.objectContaining({
          url: `${calendarWithoutSlash}/${uid}.ics`,
        }),
      })
    );
  });

  it("skips delete when the object is not found", async () => {
    const { deleteCalendarObject } = await import("tsdav");
    const service = new TestCalendarService();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => "",
        headers: { get: () => null },
      })
    );

    vi.spyOn(service, "listCalendars").mockResolvedValue([
      {
        externalId: `${calendarWithoutSlash}/`,
        name: "Stalwart Calendar",
        primary: true,
        readOnly: false,
        email: "paul@example.com",
        integrationName: "caldav",
        credentialId: 1,
      },
    ]);

    await service.deleteEvent(uid);

    expect(deleteCalendarObject).not.toHaveBeenCalled();
  });
});
