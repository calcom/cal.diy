import type { CalendarSubscriptionEventItem } from "@calcom/features/calendar-subscription/lib/CalendarSubscriptionPort.interface";
import type { ICalendarCacheEventRepository } from "@calcom/features/calendar-subscription/lib/cache/CalendarCacheEventRepository.interface";
import type { SelectedCalendar } from "@calcom/prisma/client";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { CalendarCacheEventService } from "../CalendarCacheEventService";

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
  createdAt: new Date(),
  updatedAt: new Date(),
  channelId: "test-channel-id",
  channelKind: "web_hook",
  channelResourceId: "test-resource-id",
  channelResourceUri: "test-resource-uri",
  channelExpiration: new Date(Date.now() + 86400000),
  syncSubscribedAt: new Date(),
  syncSubscribedErrorAt: null,
  syncSubscribedErrorCount: 0,
  syncToken: "test-sync-token",
  syncedAt: new Date(),
  syncErrorAt: null,
  syncErrorCount: 0,
};

describe("CalendarCacheEventService", () => {
  let service: CalendarCacheEventService;
  let mockRepository: ICalendarCacheEventRepository;

  beforeEach(() => {
    mockRepository = {
      upsertMany: vi.fn().mockResolvedValue(undefined),
      deleteMany: vi.fn().mockResolvedValue(undefined),
      deleteAllBySelectedCalendarId: vi.fn().mockResolvedValue(undefined),
      deleteStale: vi.fn().mockResolvedValue(undefined),
      findAllBySelectedCalendarIdsBetween: vi.fn().mockResolvedValue([]),
    };

    service = new CalendarCacheEventService({
      calendarCacheEventRepository: mockRepository,
    });
  });

  describe("handleEvents", () => {
    test("should process busy events and store them in cache", async () => {
      const events: CalendarSubscriptionEventItem[] = [
        {
          id: "event-1",
          iCalUID: "event-1@cal.com",
          start: new Date("2023-12-01T10:00:00Z"),
          end: new Date("2023-12-01T11:00:00Z"),
          busy: true,
          summary: "Test Event",
          description: "Test Description",
          location: "Test Location",
          status: "confirmed",
          isAllDay: false,
          timeZone: "UTC",
          recurringEventId: null,
          originalStartDate: null,
          createdAt: new Date("2023-12-01T09:00:00Z"),
          updatedAt: new Date("2023-12-01T09:30:00Z"),
          etag: "test-etag",
          kind: "calendar#event",
        },
      ];

      await service.handleEvents(mockSelectedCalendar, events);

      expect(mockRepository.upsertMany).toHaveBeenCalledWith([
        {
          externalId: "event-1",
          selectedCalendarId: "test-calendar-id",
          start: new Date("2023-12-01T10:00:00Z"),
          end: new Date("2023-12-01T11:00:00Z"),
          summary: "Test Event",
          description: "Test Description",
          location: "Test Location",
          isAllDay: false,
          timeZone: "UTC",
          originalStartTime: null,
          recurringEventId: null,
          externalEtag: "test-etag",
          externalCreatedAt: new Date("2023-12-01T09:00:00Z"),
          externalUpdatedAt: new Date("2023-12-01T09:30:00Z"),
        },
      ]);
      expect(mockRepository.deleteMany).toHaveBeenCalledWith([]);
    });

    test("should not store free events in cache", async () => {
      const events: CalendarSubscriptionEventItem[] = [
        {
          id: "event-1",
          iCalUID: "event-1@cal.com",
          start: new Date("2023-12-01T10:00:00Z"),
          end: new Date("2023-12-01T11:00:00Z"),
          busy: false,
          summary: "Free Event",
          description: "Free Description",
          location: "Free Location",
          status: "confirmed",
          isAllDay: false,
          timeZone: "UTC",
          recurringEventId: null,
          originalStartDate: null,
          createdAt: new Date("2023-12-01T09:00:00Z"),
          updatedAt: new Date("2023-12-01T09:30:00Z"),
          etag: "test-etag",
          kind: "calendar#event",
        },
      ];

      await service.handleEvents(mockSelectedCalendar, events);

      expect(mockRepository.upsertMany).toHaveBeenCalledWith([]);
      expect(mockRepository.deleteMany).toHaveBeenCalledWith([
        {
          selectedCalendarId: "test-calendar-id",
          externalId: "event-1",
        },
      ]);
    });

    test("should delete cancelled events from cache", async () => {
      const events: CalendarSubscriptionEventItem[] = [
        {
          id: "event-1",
          iCalUID: "event-1@cal.com",
          start: new Date("2023-12-01T10:00:00Z"),
          end: new Date("2023-12-01T11:00:00Z"),
          busy: true,
          summary: "Cancelled Event",
          description: "Cancelled Description",
          location: "Cancelled Location",
          status: "cancelled",
          isAllDay: false,
          timeZone: "UTC",
          recurringEventId: null,
          originalStartDate: null,
          createdAt: new Date("2023-12-01T09:00:00Z"),
          updatedAt: new Date("2023-12-01T09:30:00Z"),
          etag: "test-etag",
          kind: "calendar#event",
        },
      ];

      await service.handleEvents(mockSelectedCalendar, events);

      expect(mockRepository.upsertMany).toHaveBeenCalledWith([]);
      expect(mockRepository.deleteMany).toHaveBeenCalledWith([
        {
          selectedCalendarId: "test-calendar-id",
          externalId: "event-1",
        },
      ]);
    });

    test("should handle mixed event types correctly", async () => {
      const events: CalendarSubscriptionEventItem[] = [
        {
          id: "event-1",
          iCalUID: "event-1@cal.com",
          start: new Date("2023-12-01T10:00:00Z"),
          end: new Date("2023-12-01T11:00:00Z"),
          busy: true,
          summary: "Busy Event",
          description: "Busy Description",
          location: "Busy Location",
          status: "confirmed",
          isAllDay: false,
          timeZone: "UTC",
          recurringEventId: null,
          originalStartDate: null,
          createdAt: new Date("2023-12-01T09:00:00Z"),
          updatedAt: new Date("2023-12-01T09:30:00Z"),
          etag: "test-etag-1",
          kind: "calendar#event",
        },
        {
          id: "event-2",
          iCalUID: "event-2@cal.com",
          start: new Date("2023-12-01T12:00:00Z"),
          end: new Date("2023-12-01T13:00:00Z"),
          busy: false,
          summary: "Free Event",
          description: "Free Description",
          location: "Free Location",
          status: "confirmed",
          isAllDay: false,
          timeZone: "UTC",
          recurringEventId: null,
          originalStartDate: null,
          createdAt: new Date("2023-12-01T11:00:00Z"),
          updatedAt: new Date("2023-12-01T11:30:00Z"),
          etag: "test-etag-2",
          kind: "calendar#event",
        },
        {
          id: "event-3",
          iCalUID: "event-3@cal.com",
          start: new Date("2023-12-01T14:00:00Z"),
          end: new Date("2023-12-01T15:00:00Z"),
          busy: true,
          summary: "Cancelled Event",
          description: "Cancelled Description",
          location: "Cancelled Location",
          status: "cancelled",
          isAllDay: false,
          timeZone: "UTC",
          recurringEventId: null,
          originalStartDate: null,
          createdAt: new Date("2023-12-01T13:00:00Z"),
          updatedAt: new Date("2023-12-01T13:30:00Z"),
          etag: "test-etag-3",
          kind: "calendar#event",
        },
      ];

      await service.handleEvents(mockSelectedCalendar, events);

      expect(mockRepository.upsertMany).toHaveBeenCalledWith([
        {
          externalId: "event-1",
          selectedCalendarId: "test-calendar-id",
          start: new Date("2023-12-01T10:00:00Z"),
          end: new Date("2023-12-01T11:00:00Z"),
          summary: "Busy Event",
          description: "Busy Description",
          location: "Busy Location",
          isAllDay: false,
          timeZone: "UTC",
          originalStartTime: null,
          recurringEventId: null,
          externalEtag: "test-etag-1",
          externalCreatedAt: new Date("2023-12-01T09:00:00Z"),
          externalUpdatedAt: new Date("2023-12-01T09:30:00Z"),
        },
      ]);
      expect(mockRepository.deleteMany).toHaveBeenCalledWith([
        {
          selectedCalendarId: "test-calendar-id",
          externalId: "event-2",
        },
        {
          selectedCalendarId: "test-calendar-id",
          externalId: "event-3",
        },
      ]);
    });

    test("should handle empty events array", async () => {
      await service.handleEvents(mockSelectedCalendar, []);

      expect(mockRepository.upsertMany).toHaveBeenCalledWith([]);
      expect(mockRepository.deleteMany).toHaveBeenCalledWith([]);
    });

    test("should handle events with missing optional fields", async () => {
      const events: CalendarSubscriptionEventItem[] = [
        {
          id: "event-1",
          iCalUID: "event-1@cal.com",
          start: new Date("2023-12-01T10:00:00Z"),
          end: new Date("2023-12-01T11:00:00Z"),
          busy: true,
          summary: null,
          description: null,
          location: null,
          status: "confirmed",
          isAllDay: false,
          timeZone: null,
          recurringEventId: null,
          originalStartDate: null,
          createdAt: null,
          updatedAt: null,
          etag: null,
          kind: null,
        },
      ];

      await service.handleEvents(mockSelectedCalendar, events);

      expect(mockRepository.upsertMany).toHaveBeenCalledWith([
        {
          externalId: "event-1",
          selectedCalendarId: "test-calendar-id",
          start: new Date("2023-12-01T10:00:00Z"),
          end: new Date("2023-12-01T11:00:00Z"),
          summary: null,
          description: null,
          location: null,
          isAllDay: false,
          timeZone: null,
          originalStartTime: null,
          recurringEventId: null,
          externalEtag: "",
          externalCreatedAt: null,
          externalUpdatedAt: null,
        },
      ]);
    });
  });

  describe("cleanupCache", () => {
    test("should delete all events for selected calendar", async () => {
      await service.cleanupCache(mockSelectedCalendar);

      expect(mockRepository.deleteAllBySelectedCalendarId).toHaveBeenCalledWith("test-calendar-id");
    });
  });

  describe("cleanupStaleCache", () => {
    test("should delete stale events", async () => {
      await service.cleanupStaleCache();

      expect(mockRepository.deleteStale).toHaveBeenCalled();
    });
  });

  describe("isCalendarTypeSupported", () => {
    test("should return true for supported calendar types", () => {
      expect(CalendarCacheEventService.isCalendarTypeSupported("google_calendar")).toBe(true);
    });

    test("should return false for unsupported calendar types", () => {
      expect(CalendarCacheEventService.isCalendarTypeSupported("office365_calendar")).toBe(false);
      expect(CalendarCacheEventService.isCalendarTypeSupported("outlook_calendar")).toBe(false);
      expect(CalendarCacheEventService.isCalendarTypeSupported("apple_calendar")).toBe(false);
      expect(CalendarCacheEventService.isCalendarTypeSupported("unknown_calendar")).toBe(false);
    });

    test("should return false for null", () => {
      expect(CalendarCacheEventService.isCalendarTypeSupported(null)).toBe(false);
    });
  });
});
