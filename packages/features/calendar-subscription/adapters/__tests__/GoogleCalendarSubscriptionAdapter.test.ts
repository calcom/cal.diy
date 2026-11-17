import "../__mocks__/CalendarAuth";

import process from "node:process";
import dayjs from "@calcom/dayjs";
import type { SelectedCalendar } from "@calcom/prisma/client";
import type { CredentialForCalendarServiceWithEmail } from "@calcom/types/Credential";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { GoogleCalendarSubscriptionAdapter } from "../GoogleCalendarSubscription.adapter";

const addMonthsFromNow = (months: number) => {
  const date = dayjs();
  return date.add(months, "months").startOf("day");
};

const today = dayjs().startOf("day");

const oneWeekFromNow = today.add(7, "days");

const eventEndTime = oneWeekFromNow.add(1, "hours");

const channelExpirationDate = new Date(Date.now() + 86400000);

vi.mock("uuid", () => ({
  v4: vi.fn().mockReturnValue("test-uuid"),
}));

const mockSelectedCalendar: SelectedCalendar = {
  id: "test-calendar-id",
  userId: 1,
  credentialId: 1,
  integration: "google_calendar",
  externalId: "test@example.com",
  eventTypeId: null,
  delegationCredentialId: null,
  googleChannelId: null,
  googleChannelKind: null,
  googleChannelResourceId: null,
  googleChannelResourceUri: null,
  googleChannelExpiration: null,
  error: null,
  lastErrorAt: null,
  watchAttempts: 0,
  maxAttempts: 3,
  unwatchAttempts: 0,
  createdAt: today.toDate(),
  updatedAt: today.toDate(),
  channelId: "test-channel-id",
  channelKind: "web_hook",
  channelResourceId: "test-resource-id",
  channelResourceUri: "test-resource-uri",
  channelExpiration: channelExpirationDate,
  syncSubscribedAt: today.toDate(),
  syncSubscribedErrorAt: null,
  syncSubscribedErrorCount: 0,
  syncToken: "test-sync-token",
  syncedAt: today.toDate(),
  syncErrorAt: null,
  syncErrorCount: 0,
};

const mockCredential = {
  id: 1,
  key: { access_token: "test-token" },
  user: { email: "test@example.com" },
  delegatedTo: null,
  type: null,
  teamId: null,
} as unknown as CredentialForCalendarServiceWithEmail;

describe("GoogleCalendarSubscriptionAdapter", () => {
  let adapter: GoogleCalendarSubscriptionAdapter;
  let mockClient: {
    events: {
      watch: ReturnType<typeof vi.fn>;
      list: ReturnType<typeof vi.fn>;
    };
    channels: {
      stop: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(async () => {
    process.env.GOOGLE_WEBHOOK_TOKEN = "test-webhook-token";
    process.env.GOOGLE_WEBHOOK_URL = "https://example.com";

    mockClient = {
      events: {
        watch: vi.fn(),
        list: vi.fn(),
      },
      channels: {
        stop: vi.fn(),
      },
    };

    const { CalendarAuth } = await import("../__mocks__/CalendarAuth");
    vi.mocked(CalendarAuth).mockImplementation(function () {
      return {
        getClient: vi.fn().mockResolvedValue(mockClient),
      };
    });

    adapter = new GoogleCalendarSubscriptionAdapter();
    vi.clearAllMocks();
  });

  describe("validate", () => {
    test("should validate webhook with correct token", async () => {
      const mockRequest = {
        headers: {
          get: vi.fn().mockReturnValue("test-webhook-token"),
        },
      } as unknown as Request;

      const result = await adapter.validate(mockRequest);

      expect(result).toBe(true);
      expect(mockRequest.headers.get).toHaveBeenCalledWith("X-Goog-Channel-Token");
    });

    test("should reject webhook with incorrect token", async () => {
      const mockRequest = {
        headers: {
          get: vi.fn().mockReturnValue("wrong-token"),
        },
      } as unknown as Request;

      const result = await adapter.validate(mockRequest);

      expect(result).toBe(false);
    });

    test("should reject webhook when token is not configured", async () => {
      delete process.env.GOOGLE_WEBHOOK_TOKEN;
      adapter = new GoogleCalendarSubscriptionAdapter();

      const mockRequest = {
        headers: {
          get: vi.fn().mockReturnValue("test-webhook-token"),
        },
      } as unknown as Request;

      const result = await adapter.validate(mockRequest);

      expect(result).toBe(false);
    });

    test("should reject webhook with missing token header", async () => {
      const mockRequest = {
        headers: {
          get: vi.fn().mockReturnValue(null),
        },
      } as unknown as Request;

      const result = await adapter.validate(mockRequest);

      expect(result).toBe(false);
    });
  });

  describe("extractChannelId", () => {
    test("should extract channel ID from webhook headers", async () => {
      const mockRequest = {
        headers: {
          get: vi.fn().mockReturnValue("test-channel-id"),
        },
      } as unknown as Request;

      const result = await adapter.extractChannelId(mockRequest);

      expect(result).toBe("test-channel-id");
      expect(mockRequest.headers.get).toHaveBeenCalledWith("X-Goog-Channel-ID");
    });

    test("should return null when channel ID is missing", async () => {
      const mockRequest = {
        headers: {
          get: vi.fn().mockReturnValue(null),
        },
      } as unknown as Request;

      const result = await adapter.extractChannelId(mockRequest);

      expect(result).toBeNull();
    });
  });

  describe("subscribe", () => {
    test("should successfully subscribe to calendar", async () => {
      const mockWatchResponse = {
        data: {
          id: "test-channel-id",
          resourceId: "test-resource-id",
          resourceUri: "test-resource-uri",
          expiration: String(channelExpirationDate.getTime()),
        },
      };

      mockClient.events.watch.mockResolvedValue(mockWatchResponse);

      const result = await adapter.subscribe(mockSelectedCalendar, mockCredential);

      expect(mockClient.events.watch).toHaveBeenCalledWith({
        calendarId: "test@example.com",
        requestBody: {
          id: "test-uuid",
          type: "web_hook",
          address: "https://example.com/api/webhooks/calendar-subscription/google_calendar",
          token: "test-webhook-token",
          params: {
            ttl: "2592000",
          },
        },
      });

      expect(result).toEqual({
        provider: "google_calendar",
        id: "test-channel-id",
        resourceId: "test-resource-id",
        resourceUri: "test-resource-uri",
        expiration: channelExpirationDate,
      });
    });

    test("should handle expiration as ISO string", async () => {
      const mockExpirationDate = new Date(Date.now() + 10000000);
      const mockWatchResponse = {
        data: {
          id: "test-channel-id",
          resourceId: "test-resource-id",
          resourceUri: "test-resource-uri",
          expiration: mockExpirationDate.toISOString(),
        },
      };

      mockClient.events.watch.mockResolvedValue(mockWatchResponse);

      const result = await adapter.subscribe(mockSelectedCalendar, mockCredential);

      expect(result.expiration).toEqual(mockExpirationDate);
    });

    test("should handle missing expiration", async () => {
      const mockWatchResponse = {
        data: {
          id: "test-channel-id",
          resourceId: "test-resource-id",
          resourceUri: "test-resource-uri",
        },
      };

      mockClient.events.watch.mockResolvedValue(mockWatchResponse);

      const result = await adapter.subscribe(mockSelectedCalendar, mockCredential);

      expect(result.expiration).toBeNull();
    });
  });

  describe("unsubscribe", () => {
    test("should successfully unsubscribe from calendar", async () => {
      mockClient.channels.stop.mockResolvedValue({});

      await adapter.unsubscribe(mockSelectedCalendar, mockCredential);

      expect(mockClient.channels.stop).toHaveBeenCalledWith({
        requestBody: {
          id: "test-channel-id",
          resourceId: "test-resource-id",
        },
      });
    });

    test("should handle unsubscribe errors", async () => {
      const error = new Error("Unsubscribe failed");
      mockClient.channels.stop.mockRejectedValue(error);

      await expect(adapter.unsubscribe(mockSelectedCalendar, mockCredential)).rejects.toThrow(
        "Unsubscribe failed"
      );
    });
  });

  describe("fetchEvents", () => {
    const commonEventData = {
      iCalUID: "event-1@cal.com",
      summary: "Test Event",
      description: "Test Description",
      location: "Test Location",
      status: "confirmed",
      transparency: "opaque",
      kind: "calendar#event",
      etag: "test-etag",
      created: today.toISOString(),
      updated: today.toISOString(),
    };

    test("should fetch events with sync token", async () => {
      const mockEventsResponse = {
        data: {
          nextSyncToken: "new-sync-token",
          items: [
            {
              id: "event-1",
              ...commonEventData,
              start: {
                dateTime: oneWeekFromNow.toISOString(),
                timeZone: "UTC",
              },
              end: {
                dateTime: eventEndTime.toISOString(),
              },
            },
          ],
        },
      };

      mockClient.events.list.mockResolvedValue(mockEventsResponse);

      const result = await adapter.fetchEvents(mockSelectedCalendar, mockCredential);

      expect(mockClient.events.list).toHaveBeenCalledWith({
        calendarId: "test@example.com",
        pageToken: undefined,
        singleEvents: true,
        syncToken: "test-sync-token",
      });

      expect(result).toEqual({
        provider: "google_calendar",
        syncToken: "new-sync-token",
        items: [
          {
            id: "event-1",
            iCalUID: "event-1@cal.com",
            start: oneWeekFromNow.toDate(),
            end: eventEndTime.toDate(),
            busy: true,
            summary: "Test Event",
            description: "Test Description",
            location: "Test Location",
            kind: "calendar#event",
            etag: "test-etag",
            status: "confirmed",
            isAllDay: false,
            timeZone: "UTC",
            recurringEventId: null,
            originalStartDate: null,
            createdAt: today.toDate(),
            updatedAt: today.toDate(),
          },
        ],
      });
    });

    test("should fetch events without sync token (initial sync) with a 3-month range", async () => {
      const calendarWithoutSyncToken = {
        ...mockSelectedCalendar,
        syncToken: null,
      };

      const mockEventsResponse = {
        data: {
          nextSyncToken: "initial-sync-token",
          items: [],
        },
      };

      mockClient.events.list.mockResolvedValue(mockEventsResponse);

      const result = await adapter.fetchEvents(calendarWithoutSyncToken, mockCredential);

      const expectedTimeMin = today.startOf("day").toISOString();
      const expectedTimeMax = addMonthsFromNow(3).endOf("day").toISOString();

      expect(mockClient.events.list).toHaveBeenCalledWith({
        calendarId: "test@example.com",
        pageToken: undefined,
        singleEvents: true,
        timeMin: expectedTimeMin,
        timeMax: expectedTimeMax,
      });

      expect(result.syncToken).toBe("initial-sync-token");
    });

    test("should handle all-day events", async () => {
      const allDayStart = oneWeekFromNow.startOf("day");
      const allDayEnd = oneWeekFromNow.endOf("day");

      const mockEventsResponse = {
        data: {
          nextSyncToken: "new-sync-token",
          items: [
            {
              id: "event-1",
              ...commonEventData,
              start: {
                date: allDayStart.toISOString().split("T")[0],
              },
              end: {
                date: allDayEnd.toISOString().split("T")[0],
              },
            },
          ],
        },
      };

      mockClient.events.list.mockResolvedValue(mockEventsResponse);

      const result = await adapter.fetchEvents(mockSelectedCalendar, mockCredential);

      expect(result.items[0].isAllDay).toBe(true);
      expect(result.items[0].start).toEqual(new Date(allDayStart.toISOString().split("T")[0]));
      expect(result.items[0].end).toEqual(new Date(allDayEnd.toISOString().split("T")[0]));
    });

    test("should handle free events (transparent)", async () => {
      const mockEventsResponse = {
        data: {
          nextSyncToken: "new-sync-token",
          items: [
            {
              id: "event-1",
              ...commonEventData,
              summary: "Free Event",
              start: {
                dateTime: oneWeekFromNow.toISOString(),
              },
              end: {
                dateTime: eventEndTime.toISOString(),
              },
              transparency: "transparent",
            },
          ],
        },
      };

      mockClient.events.list.mockResolvedValue(mockEventsResponse);

      const result = await adapter.fetchEvents(mockSelectedCalendar, mockCredential);

      expect(result.items[0].busy).toBe(false);
    });

    test("should handle pagination", async () => {
      const date2 = new Date(oneWeekFromNow.toDate());
      date2.setDate(date2.getDate() + 1);

      const mockEventsResponse1 = {
        data: {
          nextPageToken: "page-2",
          items: [
            {
              id: "event-1",
              summary: "Event 1",
              start: { dateTime: oneWeekFromNow.toISOString() },
              end: { dateTime: eventEndTime.toISOString() },
            },
          ],
        },
      };

      const mockEventsResponse2 = {
        data: {
          nextSyncToken: "final-sync-token",
          items: [
            {
              id: "event-2",
              summary: "Event 2",
              start: { dateTime: date2.toISOString() },
              end: { dateTime: new Date(date2.getTime() + 3600000).toISOString() },
            },
          ],
        },
      };

      mockClient.events.list
        .mockResolvedValueOnce(mockEventsResponse1)
        .mockResolvedValueOnce(mockEventsResponse2);

      const result = await adapter.fetchEvents(mockSelectedCalendar, mockCredential);

      expect(mockClient.events.list).toHaveBeenCalledTimes(2);
      expect(result.items).toHaveLength(2);
      expect(result.syncToken).toBe("final-sync-token");
    });

    test("should filter out events without ID", async () => {
      const mockEventsResponse = {
        data: {
          nextSyncToken: "new-sync-token",
          items: [
            {
              id: "event-1",
              summary: "Valid Event",
              start: { dateTime: oneWeekFromNow.toISOString() },
              end: { dateTime: eventEndTime.toISOString() },
            },
            {
              summary: "Invalid Event",
              start: { dateTime: oneWeekFromNow.toISOString() },
              end: { dateTime: eventEndTime.toISOString() },
            },
            {
              id: "",
              summary: "Empty ID Event",
              start: { dateTime: oneWeekFromNow.toISOString() },
              end: { dateTime: eventEndTime.toISOString() },
            },
          ],
        },
      };

      mockClient.events.list.mockResolvedValue(mockEventsResponse);

      const result = await adapter.fetchEvents(mockSelectedCalendar, mockCredential);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe("event-1");
    });
  });
});
