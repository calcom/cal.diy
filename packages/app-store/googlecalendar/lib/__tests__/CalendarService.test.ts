import oAuthManagerMock, {
  defaultMockOAuthManager,
  setFullMockOAuthManagerRequest,
} from "../../../tests/__mocks__/OAuthManager";
import "../__mocks__/features.repository";
import "../__mocks__/getGoogleAppKeys";
import {
  adminMock,
  calendarListMock,
  calendarMock,
  freebusyQueryMock,
  setCredentialsMock,
  setLastCreatedJWT,
  setLastCreatedOAuth2Client,
} from "../__mocks__/googleapis";
import { beforeEach, describe, expect, test, vi } from "vitest";
import "vitest-fetch-mock";

import process from "node:process";
import { MeetLocationType } from "@calcom/app-store/constants";
import logger from "@calcom/lib/logger";
import type { CredentialForCalendarServiceWithEmail } from "@calcom/types/Credential";
import BuildCalendarService, { createGoogleCalendarServiceWithGoogleType } from "../CalendarService";
import { createCredentialForCalendarService, createMockJWTInstance } from "./utils";

const log = logger.getSubLogger({ prefix: ["CalendarService.test"] });

beforeEach(() => {
  vi.clearAllMocks();
  setCredentialsMock.mockClear();
  oAuthManagerMock.OAuthManager = defaultMockOAuthManager;
  calendarMock.calendar_v3.Calendar.mockClear();
  adminMock.admin_directory_v1.Admin.mockClear();

  setLastCreatedJWT(null);
  setLastCreatedOAuth2Client(null);
  createMockJWTInstance({});
});

const mockCredential: CredentialForCalendarServiceWithEmail = {
  id: 1,
  userId: 1,
  appId: "google-calendar",
  type: "google_calendar",
  key: {
    access_token: "<INVALID_TOKEN>",
  },
  user: {
    email: "user@example.com",
  },
  delegationCredentialId: null,
  delegatedTo: null,
  invalid: false,
  teamId: null,
  encryptedKey: null,
};

describe("getAvailability", () => {
  test("returns availability for selected calendars", async () => {
    const calendarService = BuildCalendarService(mockCredential);
    setFullMockOAuthManagerRequest();
    const mockedBusyTimes1 = [
      {
        start: "2024-01-01",
        end: "2024-01-02",
      },
    ];
    const mockedBusyTimes2 = [
      {
        start: "2024-01-03",
        end: "2024-01-04",
      },
    ];

    const mockedBusyTimes = [mockedBusyTimes1, mockedBusyTimes2];
    calendarListMock.mockImplementation(() => {
      return {
        data: {
          items: [
            {
              id: "calendar1@test.com",
            },
            {
              id: "calendar2@test.com",
            },
          ],
        },
      };
    });
    // Mock Once so that the getAvailability call doesn't accidentally reuse this mock result
    freebusyQueryMock.mockImplementation(({ requestBody }: { requestBody: any }) => {
      const calendarsObject: any = {};
      requestBody.items.forEach((item: any, index: number) => {
        calendarsObject[item.id] = {
          busy: mockedBusyTimes[index],
        };
      });
      return {
        data: {
          calendars: calendarsObject,
        },
      };
    });

    const availabilityWithPrimaryAsFallback = await calendarService.getAvailability({
      dateFrom: "2024-01-01",
      dateTo: "2024-01-02",
      selectedCalendars: [],
      mode: "slots",
      fallbackToPrimary: true,
    });

    expect(availabilityWithPrimaryAsFallback).toEqual(mockedBusyTimes1);

    const availabilityWithAllCalendarsAsFallback = await calendarService.getAvailability({
      dateFrom: "2024-01-01",
      dateTo: "2024-01-02",
      selectedCalendars: [],
      mode: "slots",
      fallbackToPrimary: false,
    });

    expect(availabilityWithAllCalendarsAsFallback).toEqual([...mockedBusyTimes1, ...mockedBusyTimes2]);
  });
});

describe("getPrimaryCalendar", () => {
  test("should fetch primary calendar using 'primary' keyword", async () => {
    const calendarService = createGoogleCalendarServiceWithGoogleType(mockCredential);
    setFullMockOAuthManagerRequest();
    const mockPrimaryCalendar = {
      id: "user@example.com",
      summary: "Primary Calendar",
      description: "Primary calendar for user@example.com",
      timeZone: "America/New_York",
    };
    const calendarsGetMock = vi.fn().mockResolvedValue({
      data: mockPrimaryCalendar,
    });
    calendarMock.calendar_v3.Calendar().calendars.get = calendarsGetMock;
    const result = await calendarService.getPrimaryCalendar();
    expect(calendarsGetMock).toHaveBeenCalledTimes(1);
    expect(calendarsGetMock).toHaveBeenCalledWith({
      calendarId: "primary",
    });
    expect(result).toEqual(mockPrimaryCalendar);
  });
});

describe("Date Optimization Benchmarks", () => {
  test("native Date calculations should be significantly faster than dayjs while producing identical results", async () => {
    const dayjs = (await import("@calcom/dayjs")).default;

    const testCases = [
      {
        dateFrom: "2024-01-01T00:00:00Z",
        dateTo: "2024-01-31T00:00:00Z",
        name: "30 days",
        expectedDiff: 30,
      },
      {
        dateFrom: "2024-01-01T00:00:00Z",
        dateTo: "2024-03-31T00:00:00Z",
        name: "90 days (API limit)",
        expectedDiff: 90,
      },
      {
        dateFrom: "2024-01-01T00:00:00Z",
        dateTo: "2024-07-01T00:00:00Z",
        name: "182 days (chunking required)",
        expectedDiff: 182,
      },
    ];

    const iterations = 1000; // Reduced for test performance

    for (const testCase of testCases) {
      log.info(`Testing ${testCase.name}...`);

      // Test correctness first
      const dayjsDiff = dayjs(testCase.dateTo).diff(dayjs(testCase.dateFrom), "days");
      const nativeDiff = Math.floor(
        (new Date(testCase.dateTo).getTime() - new Date(testCase.dateFrom).getTime()) / (1000 * 60 * 60 * 24)
      );

      // Verify identical results
      expect(nativeDiff).toBe(dayjsDiff);
      expect(nativeDiff).toBe(testCase.expectedDiff);

      // Performance test - dayjs approach
      const dayjsStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        const start = dayjs(testCase.dateFrom);
        const end = dayjs(testCase.dateTo);
        const diff = end.diff(start, "days");
      }
      const dayjsTime = performance.now() - dayjsStart;

      // Performance test - native Date approach
      const nativeStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        const start = new Date(testCase.dateFrom);
        const end = new Date(testCase.dateTo);
        const diff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      }
      const nativeTime = performance.now() - nativeStart;

      const speedupRatio = dayjsTime / nativeTime;

      log.info(
        `${testCase.name} - Dayjs: ${dayjsTime.toFixed(2)}ms, Native: ${nativeTime.toFixed(
          2
        )}ms, Speedup: ${speedupRatio.toFixed(1)}x`
      );

      if (!process.env.CI) {
        const minSpeedup = 5; // Assert significant performance improvement (at least 5x faster)
        expect(speedupRatio).toBeGreaterThan(minSpeedup);
      }
    }
  });

  test("chunking logic should produce identical results between dayjs and native Date implementations", async () => {
    const dayjs = (await import("@calcom/dayjs")).default;

    const testCases = [
      {
        dateFrom: "2024-01-01T00:00:00Z",
        dateTo: "2024-04-01T00:00:00Z", // 91 days - requires chunking
        name: "91 days (minimal chunking)",
      },
      {
        dateFrom: "2024-01-01T00:00:00Z",
        dateTo: "2024-07-01T00:00:00Z", // 182 days - multiple chunks
        name: "182 days (multiple chunks)",
      },
    ];

    for (const testCase of testCases) {
      const fromDate = new Date(testCase.dateFrom);
      const toDate = new Date(testCase.dateTo);
      const diff = Math.floor((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));

      // Only test cases that require chunking (> 90 days)
      if (diff <= 90) continue;

      // OLD WAY (dayjs-based chunking)
      const originalStartDate = dayjs(testCase.dateFrom);
      const originalEndDate = dayjs(testCase.dateTo);
      const loopsNumber = Math.ceil(diff / 90);
      let startDate = originalStartDate;
      let endDate = originalStartDate.add(90, "days");

      const oldChunks = [];
      for (let i = 0; i < loopsNumber; i++) {
        if (endDate.isAfter(originalEndDate)) endDate = originalEndDate;

        oldChunks.push({
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        });

        startDate = endDate.add(1, "minutes");
        endDate = startDate.add(90, "days");
      }

      // NEW WAY (native Date-based chunking)
      let currentStartTime = fromDate.getTime();
      const originalEndTime = toDate.getTime();
      const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
      const oneMinuteMs = 60 * 1000;

      const newChunks = [];
      for (let i = 0; i < loopsNumber; i++) {
        let currentEndTime = currentStartTime + ninetyDaysMs;

        if (currentEndTime > originalEndTime) {
          currentEndTime = originalEndTime;
        }

        newChunks.push({
          start: new Date(currentStartTime).toISOString(),
          end: new Date(currentEndTime).toISOString(),
        });

        currentStartTime = currentEndTime + oneMinuteMs;
      }

      // Verify identical chunking results
      expect(newChunks).toHaveLength(oldChunks.length);

      for (let i = 0; i < oldChunks.length; i++) {
        expect(newChunks[i].start).toBe(oldChunks[i].start);
        expect(newChunks[i].end).toBe(oldChunks[i].end);
      }

      log.info(`${testCase.name} - Generated ${newChunks.length} identical chunks`);
    }
  });

  test("date parsing should be consistent between dayjs and native Date for all expected input formats", async () => {
    const dayjs = (await import("@calcom/dayjs")).default;

    // Test various date formats that Google Calendar API might return
    const testDates = [
      "2024-01-01T00:00:00Z", // UTC
      "2024-01-01T12:30:45.123Z", // UTC with milliseconds
      "2024-01-01T00:00:00-08:00", // Timezone offset
      "2024-01-01T00:00:00+05:30", // Positive timezone offset
      "2024-12-31T23:59:59Z", // End of year
      "2024-02-29T12:00:00Z", // Leap year date
    ];

    for (const dateString of testDates) {
      const dayjsTime = dayjs(dateString).valueOf();
      const nativeTime = new Date(dateString).getTime();

      expect(nativeTime).toBe(dayjsTime);

      // Also verify ISO string output consistency
      const dayjsISO = dayjs(dateString).toISOString();
      const nativeISO = new Date(dateString).toISOString();

      expect(nativeISO).toBe(dayjsISO);

      log.debug(`Date parsing verified: ${dateString} -> ${nativeTime}`);
    }
  });

  test("fetchAvailabilityData should handle both single API call and chunked scenarios correctly", async () => {
    const calendarService = BuildCalendarService(mockCredential);
    setFullMockOAuthManagerRequest();

    const mockBusyData = [
      { start: "2024-01-01T10:00:00Z", end: "2024-01-01T11:00:00Z" },
      { start: "2024-01-01T14:00:00Z", end: "2024-01-01T15:00:00Z" },
    ];

    // Mock the getCacheOrFetchAvailability method to return consistent data
    const getFreeBusyDataSpy = vi
      .spyOn(calendarService as any, "getFreeBusyData")
      .mockResolvedValue(mockBusyData.map((item) => ({ ...item, id: "test@calendar.com" })));

    // Test single API call scenario (≤ 90 days)
    const shortRangeResult = await (calendarService as any).fetchAvailabilityData(
      ["test@calendar.com"],
      "2024-01-01T00:00:00Z",
      "2024-01-31T00:00:00Z", // 30 days
      false
    );

    expect(shortRangeResult).toEqual(mockBusyData);
    expect(getFreeBusyDataSpy).toHaveBeenCalledTimes(1);

    getFreeBusyDataSpy.mockClear();

    // Test chunked scenario (> 90 days)
    const longRangeResult = await (calendarService as any).fetchAvailabilityData(
      ["test@calendar.com"],
      "2024-01-01T00:00:00Z",
      "2024-07-01T00:00:00Z", // 182 days - should require chunking
      false
    );

    // Should return concatenated results from multiple chunks
    expect(longRangeResult.length).toBeGreaterThan(0);
    expect(getFreeBusyDataSpy).toHaveBeenCalledTimes(3); // 182 days / 90 = ~2.02 -> 3 chunks

    getFreeBusyDataSpy.mockRestore();
  });
});

describe("createEvent", () => {
  test("should create event with correct input/output format and handle all expected properties", async () => {
    const calendarService = BuildCalendarService(mockCredential);
    setFullMockOAuthManagerRequest();

    // Mock Google Calendar API response
    const mockGoogleEvent = {
      id: "mock-event-id-123",
      summary: "Test Meeting",
      description: "Test meeting description",
      start: {
        dateTime: "2024-06-15T10:00:00Z",
        timeZone: "UTC",
      },
      end: {
        dateTime: "2024-06-15T11:00:00Z",
        timeZone: "UTC",
      },
      attendees: [
        {
          email: "organizer@example.com",
          displayName: "Test Organizer",
          responseStatus: "accepted",
          organizer: true,
        },
        {
          email: "attendee@example.com",
          displayName: "Test Attendee",
          responseStatus: "accepted",
        },
      ],
      location: "Test Location",
      iCalUID: "test-ical-uid@google.com",
      recurrence: null,
    };

    // Mock calendar.events.insert
    const eventsInsertMock = vi.fn().mockResolvedValue({
      data: mockGoogleEvent,
    });

    calendarMock.calendar_v3.Calendar().events.insert = eventsInsertMock;

    // Test input - simplified CalendarServiceEvent
    const testCalEvent = {
      type: "test-event-type",
      uid: "cal-event-uid-123",
      title: "Test Meeting",
      startTime: "2024-06-15T10:00:00Z",
      endTime: "2024-06-15T11:00:00Z",
      organizer: {
        id: 1,
        name: "Test Organizer",
        email: "organizer@example.com",
        timeZone: "UTC",
        language: {
          translate: (...args: any[]) => args[0], // Mock translate function
          locale: "en",
        },
      },
      attendees: [
        {
          id: 2,
          name: "Test Attendee",
          email: "attendee@example.com",
          timeZone: "UTC",
          language: {
            translate: (...args: any[]) => args[0], // Mock translate function
            locale: "en",
          },
        },
      ],
      location: "Test Location",
      calendarDescription: "Test meeting description",
      destinationCalendar: [
        {
          id: 1,
          integration: "google_calendar",
          externalId: "primary",
          primaryEmail: null,
          userId: mockCredential.userId,
          eventTypeId: null,
          credentialId: mockCredential.id,
          delegationCredentialId: null,
          createdAt: new Date("2024-06-15T11:00:00Z"),
          updatedAt: new Date("2024-06-15T11:00:00Z"),
          customCalendarReminder: 10,
        },
      ],
      iCalUID: "test-ical-uid@google.com",
      conferenceData: undefined,
      hideCalendarEventDetails: false,
      seatsPerTimeSlot: null,
      seatsShowAttendees: true,
    };

    // Call createEvent and verify result using inline snapshot
    const result = await calendarService.createEvent(testCalEvent, mockCredential.id);

    // Verify input processing - check that Google API was called with correct payload
    expect(eventsInsertMock).toHaveBeenCalledTimes(1);
    const insertCall = eventsInsertMock.mock.calls[0][0];

    // Use inline snapshot for input validation
    expect(insertCall).toMatchInlineSnapshot(`
      {
        "calendarId": "primary",
        "conferenceDataVersion": 1,
        "requestBody": {
          "attendees": [
            {
              "displayName": "Test Organizer",
              "email": "primary",
              "id": "1",
              "language": {
                "locale": "en",
                "translate": [Function],
              },
              "name": "Test Organizer",
              "organizer": true,
              "responseStatus": "accepted",
              "timeZone": "UTC",
            },
            {
              "email": "attendee@example.com",
              "language": {
                "locale": "en",
                "translate": [Function],
              },
              "name": "Test Attendee",
              "responseStatus": "accepted",
              "timeZone": "UTC",
            },
          ],
          "description": "Test meeting description",
          "end": {
            "dateTime": "2024-06-15T11:00:00Z",
            "timeZone": "UTC",
          },
          "guestsCanSeeOtherGuests": true,
          "iCalUID": "test-ical-uid@google.com",
          "location": "Test Location",
          "reminders": {
            "useDefault": true,
          },
          "start": {
            "dateTime": "2024-06-15T10:00:00Z",
            "timeZone": "UTC",
          },
          "summary": "Test Meeting",
        },
        "sendUpdates": "none",
      }
    `);

    // Use inline snapshot for output validation
    expect(result).toMatchInlineSnapshot(`
      {
        "additionalInfo": {
          "hangoutLink": "",
        },
        "attendees": [
          {
            "displayName": "Test Organizer",
            "email": "organizer@example.com",
            "organizer": true,
            "responseStatus": "accepted",
          },
          {
            "displayName": "Test Attendee",
            "email": "attendee@example.com",
            "responseStatus": "accepted",
          },
        ],
        "description": "Test meeting description",
        "end": {
          "dateTime": "2024-06-15T11:00:00Z",
          "timeZone": "UTC",
        },
        "iCalUID": "test-ical-uid@google.com",
        "id": "mock-event-id-123",
        "location": "Test Location",
        "password": "",
        "recurrence": null,
        "start": {
          "dateTime": "2024-06-15T10:00:00Z",
          "timeZone": "UTC",
        },
        "summary": "Test Meeting",
        "thirdPartyRecurringEventId": null,
        "type": "google_calendar",
        "uid": "",
        "url": "",
      }
    `);

    log.info("createEvent test passed - input/output formats verified");
  });

  test("should handle recurring events correctly", async () => {
    const calendarService = BuildCalendarService(mockCredential);
    setFullMockOAuthManagerRequest();

    // Mock recurring event response
    const mockRecurringEvent = {
      id: "recurring-event-id",
      summary: "Weekly Meeting",
      recurrence: ["RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=10"],
      start: { dateTime: "2024-06-15T10:00:00Z", timeZone: "UTC" },
      end: { dateTime: "2024-06-15T11:00:00Z", timeZone: "UTC" },
    };

    const mockFirstInstance = {
      id: "recurring-event-id_20240615T100000Z",
      summary: "Weekly Meeting",
      start: { dateTime: "2024-06-15T10:00:00Z", timeZone: "UTC" },
      end: { dateTime: "2024-06-15T11:00:00Z", timeZone: "UTC" },
    };

    calendarMock.calendar_v3.Calendar().events.insert = vi.fn().mockResolvedValue({
      data: mockRecurringEvent,
    });

    calendarMock.calendar_v3.Calendar().events.instances = vi.fn().mockResolvedValue({
      data: { items: [mockFirstInstance] },
    });

    const recurringCalEvent = {
      type: "recurring-meeting",
      title: "Weekly Meeting",
      startTime: "2024-06-15T10:00:00Z",
      endTime: "2024-06-15T11:00:00Z",
      organizer: {
        id: 1,
        name: "Organizer",
        email: "organizer@example.com",
        timeZone: "UTC",
        language: {
          translate: (...args: any[]) => args[0], // Mock translate function
          locale: "en",
        },
      },
      attendees: [],
      recurringEvent: {
        freq: 2, // Weekly
        interval: 1,
        count: 10,
      },
      destinationCalendar: [
        {
          id: 1,
          integration: "google_calendar",
          externalId: "primary",
          primaryEmail: null,
          userId: mockCredential.userId,
          eventTypeId: null,
          credentialId: mockCredential.id,
          delegationCredentialId: null,
          createdAt: new Date("2024-06-15T11:00:00Z"),
          updatedAt: new Date("2024-06-15T11:00:00Z"),
          customCalendarReminder: 10,
        },
      ],
      calendarDescription: "Weekly team meeting",
    };

    const result = await calendarService.createEvent(recurringCalEvent, mockCredential.id);

    // Use inline snapshot for recurring event result
    expect(result).toMatchInlineSnapshot(`
      {
        "additionalInfo": {
          "hangoutLink": "",
        },
        "end": {
          "dateTime": "2024-06-15T11:00:00Z",
          "timeZone": "UTC",
        },
        "iCalUID": undefined,
        "id": "recurring-event-id_20240615T100000Z",
        "password": "",
        "start": {
          "dateTime": "2024-06-15T10:00:00Z",
          "timeZone": "UTC",
        },
        "summary": "Weekly Meeting",
        "thirdPartyRecurringEventId": "recurring-event-id",
        "type": "google_calendar",
        "uid": "",
        "url": "",
      }
    `);

    // Verify recurrence rule was included in the request
    const insertCall = calendarMock.calendar_v3.Calendar().events.insert.mock.calls[0][0];
    expect(insertCall.requestBody.recurrence).toEqual(["RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=10"]);

    log.info("createEvent recurring event test passed");
  });

  test("should use default reminders when no custom reminder is configured", async () => {
    const calendarService = BuildCalendarService(mockCredential);
    setFullMockOAuthManagerRequest();

    const mockGoogleEvent = {
      id: "mock-event-default-reminder",
      summary: "Test Meeting Default Reminder",
      start: { dateTime: "2024-06-15T10:00:00Z", timeZone: "UTC" },
      end: { dateTime: "2024-06-15T11:00:00Z", timeZone: "UTC" },
    };

    const eventsInsertMock = vi.fn().mockResolvedValue({
      data: mockGoogleEvent,
    });
    calendarMock.calendar_v3.Calendar().events.insert = eventsInsertMock;

    const testCalEvent = {
      type: "test-event-type",
      uid: "cal-event-uid-456",
      title: "Test Meeting Default Reminder",
      startTime: "2024-06-15T10:00:00Z",
      endTime: "2024-06-15T11:00:00Z",
      organizer: {
        id: 1,
        name: "Test Organizer",
        email: "organizer@example.com",
        timeZone: "UTC",
        language: { translate: (...args: any[]) => args[0], locale: "en" },
      },
      attendees: [],
      calendarDescription: "Test meeting description",
      destinationCalendar: [
        {
          id: 1,
          integration: "google_calendar",
          externalId: "primary",
          primaryEmail: null,
          userId: mockCredential.userId,
          eventTypeId: null,
          credentialId: mockCredential.id,
          delegationCredentialId: null,
          createdAt: new Date("2024-06-15T11:00:00Z"),
          updatedAt: new Date("2024-06-15T11:00:00Z"),
          customCalendarReminder: null,
        },
      ],
    };

    // Mock the getReminderDuration method to return null (no custom reminder configured)
    vi.spyOn(calendarService as any, "getReminderDuration").mockResolvedValue(null);

    await calendarService.createEvent(testCalEvent, mockCredential.id);

    const insertCall = eventsInsertMock.mock.calls[0][0];

    // When no custom reminder is configured, should use Google Calendar's default
    expect(insertCall.requestBody.reminders).toEqual({
      useDefault: true,
    });

    log.info("createEvent with default reminders test passed");
  });

  test("should handle 'just in time' reminder (0 minutes) correctly", async () => {
    const calendarService = BuildCalendarService(mockCredential);
    setFullMockOAuthManagerRequest();

    // Mock the getReminderDuration method to return 0 (just in time)
    vi.spyOn(calendarService as any, "getReminderDuration").mockResolvedValue(0);

    const mockGoogleEvent = {
      id: "mock-event-just-in-time",
      summary: "Test Meeting Just In Time",
      start: { dateTime: "2024-06-15T10:00:00Z", timeZone: "UTC" },
      end: { dateTime: "2024-06-15T11:00:00Z", timeZone: "UTC" },
    };

    const eventsInsertMock = vi.fn().mockResolvedValue({
      data: mockGoogleEvent,
    });
    calendarMock.calendar_v3.Calendar().events.insert = eventsInsertMock;

    const testCalEvent = {
      type: "test-event-type",
      uid: "cal-event-uid-789",
      title: "Test Meeting Just In Time",
      startTime: "2024-06-15T10:00:00Z",
      endTime: "2024-06-15T11:00:00Z",
      organizer: {
        id: 1,
        name: "Test Organizer",
        email: "organizer@example.com",
        timeZone: "UTC",
        language: { translate: (...args: any[]) => args[0], locale: "en" },
      },
      attendees: [],
      calendarDescription: "Test meeting description",
      destinationCalendar: [
        {
          id: 1,
          integration: "google_calendar",
          externalId: "primary",
          primaryEmail: null,
          userId: mockCredential.userId,
          eventTypeId: null,
          credentialId: mockCredential.id,
          delegationCredentialId: null,
          createdAt: new Date("2024-06-15T11:00:00Z"),
          updatedAt: new Date("2024-06-15T11:00:00Z"),
          customCalendarReminder: 0,
        },
      ],
    };

    await calendarService.createEvent(testCalEvent, mockCredential.id);

    const insertCall = eventsInsertMock.mock.calls[0][0];

    // When "just in time" (0 minutes) is configured, should override with 0-minute reminders
    expect(insertCall.requestBody.reminders).toEqual({
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 0 },
        { method: "email", minutes: 0 },
      ],
    });

    log.info("createEvent with just in time reminders test passed");
  });

  test("should patch event location with hangoutLink when event is created with hangoutLink", async () => {
    const calendarService = BuildCalendarService(mockCredential);
    setFullMockOAuthManagerRequest();

    const mockHangoutLink = "https://meet.google.com/abc-defg-hij";
    const mockGoogleEvent = {
      id: "mock-event-with-hangout",
      summary: "Test Meeting with Hangout",
      start: { dateTime: "2024-06-15T10:00:00Z", timeZone: "UTC" },
      end: { dateTime: "2024-06-15T11:00:00Z", timeZone: "UTC" },
      hangoutLink: mockHangoutLink,
    };

    const eventsInsertMock = vi.fn().mockResolvedValue({
      data: mockGoogleEvent,
    });
    const eventsPatchMock = vi.fn().mockResolvedValue({
      data: { ...mockGoogleEvent, location: mockHangoutLink },
    });

    calendarMock.calendar_v3.Calendar().events.insert = eventsInsertMock;
    calendarMock.calendar_v3.Calendar().events.patch = eventsPatchMock;

    const testCalEvent = {
      type: "test-event-type",
      uid: "cal-event-uid-hangout",
      title: "Test Meeting with Hangout",
      startTime: "2024-06-15T10:00:00Z",
      endTime: "2024-06-15T11:00:00Z",
      organizer: {
        id: 1,
        name: "Test Organizer",
        email: "organizer@example.com",
        timeZone: "UTC",
        language: { translate: (...args: any[]) => args[0], locale: "en" },
      },
      attendees: [],
      location: "Test Location",
      calendarDescription: "Test meeting description",
      destinationCalendar: [
        {
          id: 1,
          integration: "google_calendar",
          externalId: "primary",
          primaryEmail: null,
          userId: mockCredential.userId,
          eventTypeId: null,
          credentialId: mockCredential.id,
          delegationCredentialId: null,
          createdAt: new Date("2024-06-15T11:00:00Z"),
          updatedAt: new Date("2024-06-15T11:00:00Z"),
          customCalendarReminder: null,
        },
      ],
    };

    await calendarService.createEvent(testCalEvent, mockCredential.id);

    // Verify that patch was called with hangoutLink in additionalInformation
    expect(eventsPatchMock).toHaveBeenCalledTimes(1);
    const patchCall = eventsPatchMock.mock.calls[0][0];
    expect(patchCall.calendarId).toBe("primary");
    expect(patchCall.eventId).toBe("mock-event-with-hangout");
    expect(patchCall.requestBody.location).toBe(mockHangoutLink);
    expect(patchCall.requestBody.description).toBeDefined();

    // The insert suppresses Google's invitation (sendUpdates: "none"), so the
    // follow-up patch must too, otherwise attendees get a phantom "Updated invitation"
    expect(patchCall.sendUpdates).toBe("none");

    log.info("createEvent with hangoutLink patch test passed");
  });
});

describe("updateEvent", () => {
  test("should patch event location with hangoutLink when event is updated with hangoutLink and MeetLocationType", async () => {
    const calendarService = BuildCalendarService(mockCredential);
    setFullMockOAuthManagerRequest();

    const mockHangoutLink = "https://meet.google.com/xyz-uvwx-rst";
    const mockUpdatedEvent = {
      id: "existing-event-id",
      summary: "Updated Meeting with Hangout",
      start: { dateTime: "2024-06-15T10:00:00Z", timeZone: "UTC" },
      end: { dateTime: "2024-06-15T11:00:00Z", timeZone: "UTC" },
      hangoutLink: mockHangoutLink,
    };

    const eventsUpdateMock = vi.fn().mockResolvedValue({
      data: mockUpdatedEvent,
    });
    const eventsPatchMock = vi.fn().mockResolvedValue({
      data: { ...mockUpdatedEvent, location: mockHangoutLink },
    });

    calendarMock.calendar_v3.Calendar().events.update = eventsUpdateMock;
    calendarMock.calendar_v3.Calendar().events.patch = eventsPatchMock;

    const testCalEvent = {
      type: "test-event-type",
      uid: "existing-event-id",
      title: "Updated Meeting with Hangout",
      startTime: "2024-06-15T10:00:00Z",
      endTime: "2024-06-15T11:00:00Z",
      organizer: {
        id: 1,
        name: "Test Organizer",
        email: "organizer@example.com",
        timeZone: "UTC",
        language: { translate: (...args: any[]) => args[0], locale: "en" },
      },
      attendees: [],
      location: MeetLocationType,
      calendarDescription: "Updated meeting description",
      destinationCalendar: [
        {
          id: 1,
          integration: "google_calendar",
          externalId: "primary",
          primaryEmail: null,
          userId: mockCredential.userId,
          eventTypeId: null,
          credentialId: mockCredential.id,
          delegationCredentialId: null,
          createdAt: new Date("2024-06-15T11:00:00Z"),
          updatedAt: new Date("2024-06-15T11:00:00Z"),
          customCalendarReminder: null,
        },
      ],
    };

    const result = await calendarService.updateEvent("existing-event-id", testCalEvent, "primary");

    // Verify that patch was called with hangoutLink in additionalInformation
    expect(eventsPatchMock).toHaveBeenCalledTimes(1);
    const patchCall = eventsPatchMock.mock.calls[0][0];
    expect(patchCall.calendarId).toBe("primary");
    expect(patchCall.eventId).toBe("existing-event-id");
    expect(patchCall.requestBody.location).toBe(mockHangoutLink);
    expect(patchCall.requestBody.description).toBeDefined();

    // Verify result includes hangoutLink in additionalInfo
    expect(result.additionalInfo?.hangoutLink).toBe(mockHangoutLink);

    log.info("updateEvent with hangoutLink patch test passed");
  });

  test("should not patch event when hangoutLink is present but location is not MeetLocationType", async () => {
    const calendarService = BuildCalendarService(mockCredential);
    setFullMockOAuthManagerRequest();

    const mockHangoutLink = "https://meet.google.com/xyz-uvwx-rst";
    const mockUpdatedEvent = {
      id: "existing-event-id",
      summary: "Updated Meeting with Hangout",
      start: { dateTime: "2024-06-15T10:00:00Z", timeZone: "UTC" },
      end: { dateTime: "2024-06-15T11:00:00Z", timeZone: "UTC" },
      hangoutLink: mockHangoutLink,
    };

    const eventsUpdateMock = vi.fn().mockResolvedValue({
      data: mockUpdatedEvent,
    });
    const eventsPatchMock = vi.fn();

    calendarMock.calendar_v3.Calendar().events.update = eventsUpdateMock;
    calendarMock.calendar_v3.Calendar().events.patch = eventsPatchMock;

    const testCalEvent = {
      type: "test-event-type",
      uid: "existing-event-id",
      title: "Updated Meeting with Hangout",
      startTime: "2024-06-15T10:00:00Z",
      endTime: "2024-06-15T11:00:00Z",
      organizer: {
        id: 1,
        name: "Test Organizer",
        email: "organizer@example.com",
        timeZone: "UTC",
        language: { translate: (...args: any[]) => args[0], locale: "en" },
      },
      attendees: [],
      location: "Some other location",
      calendarDescription: "Updated meeting description",
      destinationCalendar: [
        {
          id: 1,
          integration: "google_calendar",
          externalId: "primary",
          primaryEmail: null,
          userId: mockCredential.userId,
          eventTypeId: null,
          credentialId: mockCredential.id,
          delegationCredentialId: null,
          createdAt: new Date("2024-06-15T11:00:00Z"),
          updatedAt: new Date("2024-06-15T11:00:00Z"),
          customCalendarReminder: null,
        },
      ],
    };

    await calendarService.updateEvent("existing-event-id", testCalEvent, "primary");

    // Verify that patch was NOT called when location is not MeetLocationType
    expect(eventsPatchMock).not.toHaveBeenCalled();

    log.info("updateEvent without MeetLocationType should not patch test passed");
  });

  test("should not patch event when hangoutLink is not present", async () => {
    const calendarService = BuildCalendarService(mockCredential);
    setFullMockOAuthManagerRequest();

    const mockUpdatedEvent = {
      id: "existing-event-id",
      summary: "Updated Meeting without Hangout",
      start: { dateTime: "2024-06-15T10:00:00Z", timeZone: "UTC" },
      end: { dateTime: "2024-06-15T11:00:00Z", timeZone: "UTC" },
      // No hangoutLink
    };

    const eventsUpdateMock = vi.fn().mockResolvedValue({
      data: mockUpdatedEvent,
    });
    const eventsPatchMock = vi.fn();

    calendarMock.calendar_v3.Calendar().events.update = eventsUpdateMock;
    calendarMock.calendar_v3.Calendar().events.patch = eventsPatchMock;

    const testCalEvent = {
      type: "test-event-type",
      uid: "existing-event-id",
      title: "Updated Meeting without Hangout",
      startTime: "2024-06-15T10:00:00Z",
      endTime: "2024-06-15T11:00:00Z",
      organizer: {
        id: 1,
        name: "Test Organizer",
        email: "organizer@example.com",
        timeZone: "UTC",
        language: { translate: (...args: any[]) => args[0], locale: "en" },
      },
      attendees: [],
      location: MeetLocationType,
      calendarDescription: "Updated meeting description",
      destinationCalendar: [
        {
          id: 1,
          integration: "google_calendar",
          externalId: "primary",
          primaryEmail: null,
          userId: mockCredential.userId,
          eventTypeId: null,
          credentialId: mockCredential.id,
          delegationCredentialId: null,
          createdAt: new Date("2024-06-15T11:00:00Z"),
          updatedAt: new Date("2024-06-15T11:00:00Z"),
          customCalendarReminder: null,
        },
      ],
    };

    await calendarService.updateEvent("existing-event-id", testCalEvent, "primary");

    // Verify that patch was NOT called when hangoutLink is not present
    expect(eventsPatchMock).not.toHaveBeenCalled();

    log.info("updateEvent without hangoutLink should not patch test passed");
  });
});

describe("listCalendars", () => {
  test("should filter out Google holiday calendars", async () => {
    const calendarService = BuildCalendarService(mockCredential);
    setFullMockOAuthManagerRequest();

    calendarListMock.mockImplementation(() => {
      return {
        data: {
          items: [
            {
              id: "user@example.com",
              summary: "Primary Calendar",
              primary: true,
              accessRole: "owner",
            },
            {
              id: "en.usa#holiday@group.v.calendar.google.com",
              summary: "Holidays in United States",
              primary: false,
              accessRole: "reader",
            },
            {
              id: "en.christian#holiday@group.v.calendar.google.com",
              summary: "Christian Holidays",
              primary: false,
              accessRole: "reader",
            },
          ],
        },
      };
    });

    const calendars = await calendarService.listCalendars();

    expect(calendars).toHaveLength(1);
    expect(calendars[0].externalId).toBe("user@example.com");
    expect(calendars[0].name).toBe("Primary Calendar");
  });

  test("should filter out Google birthdays/contacts calendar", async () => {
    const calendarService = BuildCalendarService(mockCredential);
    setFullMockOAuthManagerRequest();

    calendarListMock.mockImplementation(() => {
      return {
        data: {
          items: [
            {
              id: "user@example.com",
              summary: "Primary Calendar",
              primary: true,
              accessRole: "owner",
            },
            {
              id: "addressbook#contacts@group.v.calendar.google.com",
              summary: "Birthdays",
              primary: false,
              accessRole: "reader",
            },
          ],
        },
      };
    });

    const calendars = await calendarService.listCalendars();

    expect(calendars).toHaveLength(1);
    expect(calendars[0].externalId).toBe("user@example.com");
  });

  test("should filter out all Google system calendars while keeping regular calendars", async () => {
    const calendarService = BuildCalendarService(mockCredential);
    setFullMockOAuthManagerRequest();

    calendarListMock.mockImplementation(() => {
      return {
        data: {
          items: [
            {
              id: "user@example.com",
              summary: "Primary Calendar",
              primary: true,
              accessRole: "owner",
            },
            {
              id: "work@example.com",
              summary: "Work Calendar",
              primary: false,
              accessRole: "owner",
            },
            {
              id: "en.usa#holiday@group.v.calendar.google.com",
              summary: "Holidays in United States",
              primary: false,
              accessRole: "reader",
            },
            {
              id: "addressbook#contacts@group.v.calendar.google.com",
              summary: "Birthdays",
              primary: false,
              accessRole: "reader",
            },
            {
              id: "shared@example.com",
              summary: "Shared Calendar",
              primary: false,
              accessRole: "writer",
            },
          ],
        },
      };
    });

    const calendars = await calendarService.listCalendars();

    expect(calendars).toHaveLength(3);
    const calendarIds = calendars.map((cal) => cal.externalId);
    expect(calendarIds).toContain("user@example.com");
    expect(calendarIds).toContain("work@example.com");
    expect(calendarIds).toContain("shared@example.com");
    expect(calendarIds).not.toContain("en.usa#holiday@group.v.calendar.google.com");
    expect(calendarIds).not.toContain("addressbook#contacts@group.v.calendar.google.com");
  });

  test("should return empty array when all calendars are system calendars", async () => {
    const calendarService = BuildCalendarService(mockCredential);
    setFullMockOAuthManagerRequest();

    calendarListMock.mockImplementation(() => {
      return {
        data: {
          items: [
            {
              id: "en.usa#holiday@group.v.calendar.google.com",
              summary: "Holidays in United States",
              primary: false,
              accessRole: "reader",
            },
            {
              id: "addressbook#contacts@group.v.calendar.google.com",
              summary: "Birthdays",
              primary: false,
              accessRole: "reader",
            },
          ],
        },
      };
    });

    const calendars = await calendarService.listCalendars();

    expect(calendars).toHaveLength(0);
  });

  test("should handle calendars with null or undefined ids", async () => {
    const calendarService = BuildCalendarService(mockCredential);
    setFullMockOAuthManagerRequest();

    calendarListMock.mockImplementation(() => {
      return {
        data: {
          items: [
            {
              id: "user@example.com",
              summary: "Primary Calendar",
              primary: true,
              accessRole: "owner",
            },
            {
              id: null,
              summary: "Calendar with null id",
              primary: false,
              accessRole: "reader",
            },
            {
              id: undefined,
              summary: "Calendar with undefined id",
              primary: false,
              accessRole: "reader",
            },
          ],
        },
      };
    });

    const calendars = await calendarService.listCalendars();

    expect(calendars).toHaveLength(3);
    expect(calendars[0].externalId).toBe("user@example.com");
    expect(calendars[1].externalId).toBe("No id");
    expect(calendars[2].externalId).toBe("No id");
  });

  test("should correctly identify various holiday calendar formats", async () => {
    const calendarService = BuildCalendarService(mockCredential);
    setFullMockOAuthManagerRequest();

    calendarListMock.mockImplementation(() => {
      return {
        data: {
          items: [
            {
              id: "user@example.com",
              summary: "Primary Calendar",
              primary: true,
              accessRole: "owner",
            },
            {
              id: "en.uk#holiday@group.v.calendar.google.com",
              summary: "Holidays in United Kingdom",
              primary: false,
              accessRole: "reader",
            },
            {
              id: "de.german#holiday@group.v.calendar.google.com",
              summary: "Holidays in Germany",
              primary: false,
              accessRole: "reader",
            },
            {
              id: "ja.japanese#holiday@group.v.calendar.google.com",
              summary: "Holidays in Japan",
              primary: false,
              accessRole: "reader",
            },
          ],
        },
      };
    });

    const calendars = await calendarService.listCalendars();

    expect(calendars).toHaveLength(1);
    expect(calendars[0].externalId).toBe("user@example.com");
  });
});
