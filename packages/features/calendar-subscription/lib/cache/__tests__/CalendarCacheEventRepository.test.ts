import type { PrismaClient } from "@calcom/prisma";
import type { CalendarCacheEvent } from "@calcom/prisma/client";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { CalendarCacheEventRepository } from "../CalendarCacheEventRepository";

const mockPrismaClient = {
  calendarCacheEvent: {
    findMany: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
} as unknown as PrismaClient;

const mockCalendarCacheEvent: CalendarCacheEvent = {
  id: "test-id",
  iCalUID: null,
  iCalSequence: 0,
  selectedCalendarId: "test-calendar-id",
  externalId: "external-event-id",
  start: new Date("2023-12-01T10:00:00Z"),
  end: new Date("2023-12-01T11:00:00Z"),
  status: "confirmed",
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
  createdAt: new Date("2023-12-01T09:00:00Z"),
  updatedAt: new Date("2023-12-01T09:30:00Z"),
};

describe("CalendarCacheEventRepository", () => {
  let repository: CalendarCacheEventRepository;

  beforeEach(() => {
    repository = new CalendarCacheEventRepository(mockPrismaClient);
    vi.clearAllMocks();
  });

  describe("findAllBySelectedCalendarIdsBetween", () => {
    test("should find events by selected calendar IDs and date range", async () => {
      const mockEvents = [
        {
          start: new Date("2023-12-01T10:00:00Z"),
          end: new Date("2023-12-01T11:00:00Z"),
          timeZone: "UTC",
        },
      ] as unknown as CalendarCacheEvent[];

      vi.mocked(mockPrismaClient.calendarCacheEvent.findMany).mockResolvedValue(mockEvents);

      const result = await repository.findAllBySelectedCalendarIdsBetween(
        ["calendar-1", "calendar-2"],
        new Date("2023-12-01T00:00:00Z"),
        new Date("2023-12-01T23:59:59Z")
      );

      expect(mockPrismaClient.calendarCacheEvent.findMany).toHaveBeenCalledWith({
        where: {
          selectedCalendarId: {
            in: ["calendar-1", "calendar-2"],
          },
          AND: [
            { start: { lt: new Date("2023-12-01T23:59:59Z") } },
            { end: { gt: new Date("2023-12-01T00:00:00Z") } },
          ],
        },
        select: {
          start: true,
          end: true,
          timeZone: true,
        },
      });

      expect(result).toEqual(mockEvents);
    });
  });

  describe("upsertMany", () => {
    test("should upsert multiple events", async () => {
      const events = [mockCalendarCacheEvent];
      vi.mocked(mockPrismaClient.calendarCacheEvent.upsert).mockResolvedValue(mockCalendarCacheEvent);

      await repository.upsertMany(events);

      expect(mockPrismaClient.calendarCacheEvent.upsert).toHaveBeenCalledWith({
        where: {
          selectedCalendarId_externalId: {
            externalId: "external-event-id",
            selectedCalendarId: "test-calendar-id",
          },
        },
        update: {
          start: mockCalendarCacheEvent.start,
          end: mockCalendarCacheEvent.end,
          summary: mockCalendarCacheEvent.summary,
          description: mockCalendarCacheEvent.description,
          location: mockCalendarCacheEvent.location,
          isAllDay: mockCalendarCacheEvent.isAllDay,
          timeZone: mockCalendarCacheEvent.timeZone,
        },
        create: mockCalendarCacheEvent,
      });
    });

    test("should return early when events array is empty", async () => {
      const result = await repository.upsertMany([]);

      expect(mockPrismaClient.calendarCacheEvent.upsert).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    test("should handle multiple events", async () => {
      const events = [
        mockCalendarCacheEvent,
        {
          ...mockCalendarCacheEvent,
          id: "test-id-2",
          externalId: "external-event-id-2",
        },
      ];

      vi.mocked(mockPrismaClient.calendarCacheEvent.upsert).mockResolvedValue(mockCalendarCacheEvent);

      await repository.upsertMany(events);

      expect(mockPrismaClient.calendarCacheEvent.upsert).toHaveBeenCalledTimes(2);
    });
  });

  describe("deleteMany", () => {
    test("should delete multiple events", async () => {
      const eventsToDelete = [
        {
          externalId: "external-event-id-1",
          selectedCalendarId: "test-calendar-id",
        },
        {
          externalId: "external-event-id-2",
          selectedCalendarId: "test-calendar-id",
        },
      ];

      vi.mocked(mockPrismaClient.calendarCacheEvent.deleteMany).mockResolvedValue({ count: 2 });

      await repository.deleteMany(eventsToDelete);

      expect(mockPrismaClient.calendarCacheEvent.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: eventsToDelete,
        },
      });
    });

    test("should return early when events array is empty", async () => {
      const result = await repository.deleteMany([]);

      expect(mockPrismaClient.calendarCacheEvent.deleteMany).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    test("should filter out events without externalId or selectedCalendarId", async () => {
      const eventsToDelete = [
        {
          externalId: "external-event-id-1",
          selectedCalendarId: "test-calendar-id",
        },
        {
          externalId: "",
          selectedCalendarId: "test-calendar-id",
        },
        {
          externalId: "external-event-id-3",
          selectedCalendarId: "",
        },
      ];

      vi.mocked(mockPrismaClient.calendarCacheEvent.deleteMany).mockResolvedValue({ count: 1 });

      await repository.deleteMany(eventsToDelete);

      expect(mockPrismaClient.calendarCacheEvent.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [
            {
              externalId: "external-event-id-1",
              selectedCalendarId: "test-calendar-id",
            },
          ],
        },
      });
    });

    test("should return early when no valid events to delete", async () => {
      const eventsToDelete = [
        {
          externalId: "",
          selectedCalendarId: "test-calendar-id",
        },
        {
          externalId: "external-event-id",
          selectedCalendarId: "",
        },
      ];

      const result = await repository.deleteMany(eventsToDelete);

      expect(mockPrismaClient.calendarCacheEvent.deleteMany).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });
  });

  describe("deleteAllBySelectedCalendarId", () => {
    test("should delete all events for a selected calendar", async () => {
      vi.mocked(mockPrismaClient.calendarCacheEvent.deleteMany).mockResolvedValue({ count: 5 });

      await repository.deleteAllBySelectedCalendarId("test-calendar-id");

      expect(mockPrismaClient.calendarCacheEvent.deleteMany).toHaveBeenCalledWith({
        where: {
          selectedCalendarId: "test-calendar-id",
        },
      });
    });
  });

  describe("deleteStale", () => {
    test("should delete stale events", async () => {
      vi.mocked(mockPrismaClient.calendarCacheEvent.deleteMany).mockResolvedValue({ count: 3 });

      await repository.deleteStale();

      expect(mockPrismaClient.calendarCacheEvent.deleteMany).toHaveBeenCalledWith({
        where: {
          end: { lte: expect.any(Date) },
        },
      });
    });
  });
});
