import type { ICalendarCacheEventRepository } from "@calcom/features/calendar-subscription/lib/cache/CalendarCacheEventRepository.interface";
import type {
  Calendar,
  CalendarEvent,
  CalendarServiceEvent,
  EventBusyDate,
  IntegrationCalendar,
  NewCalendarEventType,
} from "@calcom/types/Calendar";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarCacheWrapper } from "../CalendarCacheWrapper";

describe("CalendarCacheWrapper", () => {
  let mockOriginalCalendar: Calendar;
  let mockRepository: ICalendarCacheEventRepository;
  let wrapper: CalendarCacheWrapper;

  const createMockCalendar = (): Calendar => ({
    getAvailability: vi.fn().mockResolvedValue([]),
    getAvailabilityWithTimeZones: vi.fn().mockResolvedValue([]),
    createEvent: vi.fn(),
    updateEvent: vi.fn(),
    deleteEvent: vi.fn(),
    listCalendars: vi.fn(),
  });

  const createMockRepository = (): ICalendarCacheEventRepository => ({
    findAllBySelectedCalendarIdsBetween: vi.fn().mockResolvedValue([]),
  });

  beforeEach(() => {
    mockOriginalCalendar = createMockCalendar();
    mockRepository = createMockRepository();
    wrapper = new CalendarCacheWrapper({
      originalCalendar: mockOriginalCalendar,
      calendarCacheEventRepository: mockRepository,
    });
  });

  describe("getAvailability", () => {
    it("should return empty array when no calendars provided", async () => {
      const result = await wrapper.getAvailability({
        dateFrom: "2025-01-01",
        dateTo: "2025-01-02",
        selectedCalendars: [],
        mode: "slots",
      });

      expect(result).toEqual([]);
      expect(mockRepository.findAllBySelectedCalendarIdsBetween).not.toHaveBeenCalled();
      expect(mockOriginalCalendar.getAvailability).not.toHaveBeenCalled();
    });

    it("should fetch only from cache when all calendars have syncToken and syncSubscribedAt", async () => {
      const selectedCalendars: IntegrationCalendar[] = [
        {
          id: "cal-1",
          externalId: "ext-1",
          integration: "google_calendar",
          syncToken: "token-1",
          syncSubscribedAt: new Date(),
        },
        {
          id: "cal-2",
          externalId: "ext-2",
          integration: "google_calendar",
          syncToken: "token-2",
          syncSubscribedAt: new Date(),
        },
      ];

      const cachedEvents: EventBusyDate[] = [
        { start: new Date("2025-01-01T10:00:00Z"), end: new Date("2025-01-01T11:00:00Z") },
        { start: new Date("2025-01-01T14:00:00Z"), end: new Date("2025-01-01T15:00:00Z") },
      ];

      vi.mocked(mockRepository.findAllBySelectedCalendarIdsBetween).mockResolvedValue(cachedEvents);

      const result = await wrapper.getAvailability({
        dateFrom: "2025-01-01",
        dateTo: "2025-01-02",
        selectedCalendars,
        mode: "slots",
      });

      expect(result).toEqual(cachedEvents);
      expect(mockRepository.findAllBySelectedCalendarIdsBetween).toHaveBeenCalledWith(
        ["cal-1", "cal-2"],
        new Date("2025-01-01"),
        new Date("2025-01-02")
      );
      expect(mockOriginalCalendar.getAvailability).not.toHaveBeenCalled();
    });

    it("should fetch only from original calendar when all calendars lack syncToken or syncSubscribedAt", async () => {
      const selectedCalendars: IntegrationCalendar[] = [
        {
          id: "cal-1",
          externalId: "ext-1",
          integration: "google_calendar",
          syncToken: null,
          syncSubscribedAt: null,
        },
        {
          id: "cal-2",
          externalId: "ext-2",
          integration: "google_calendar",
          syncToken: "token-2",
          syncSubscribedAt: null, // Missing syncSubscribedAt
        },
      ];

      const originalEvents: EventBusyDate[] = [
        { start: new Date("2025-01-01T09:00:00Z"), end: new Date("2025-01-01T10:00:00Z") },
      ];

      vi.mocked(mockOriginalCalendar.getAvailability).mockResolvedValue(originalEvents);

      const result = await wrapper.getAvailability({
        dateFrom: "2025-01-01",
        dateTo: "2025-01-02",
        selectedCalendars,
        mode: "slots",
      });

      expect(result).toEqual(originalEvents);
      expect(mockRepository.findAllBySelectedCalendarIdsBetween).not.toHaveBeenCalled();
      expect(mockOriginalCalendar.getAvailability).toHaveBeenCalledWith({
        dateFrom: "2025-01-01",
        dateTo: "2025-01-02",
        selectedCalendars,
        mode: "slots",
        fallbackToPrimary: undefined,
      });
    });

    it("should fetch from both cache and original calendar when calendars are mixed", async () => {
      const selectedCalendars: IntegrationCalendar[] = [
        {
          id: "cal-1",
          externalId: "ext-1",
          integration: "google_calendar",
          syncToken: "token-1",
          syncSubscribedAt: new Date(),
        },
        {
          id: "cal-2",
          externalId: "ext-2",
          integration: "google_calendar",
          syncToken: null,
          syncSubscribedAt: null,
        },
      ];

      const cachedEvents: EventBusyDate[] = [
        { start: new Date("2025-01-01T10:00:00Z"), end: new Date("2025-01-01T11:00:00Z") },
      ];

      const originalEvents: EventBusyDate[] = [
        { start: new Date("2025-01-01T14:00:00Z"), end: new Date("2025-01-01T15:00:00Z") },
      ];

      vi.mocked(mockRepository.findAllBySelectedCalendarIdsBetween).mockResolvedValue(cachedEvents);
      vi.mocked(mockOriginalCalendar.getAvailability).mockResolvedValue(originalEvents);

      const result = await wrapper.getAvailability({
        dateFrom: "2025-01-01",
        dateTo: "2025-01-02",
        selectedCalendars,
        mode: "slots",
      });

      expect(result).toEqual([...cachedEvents, ...originalEvents]);
      expect(mockRepository.findAllBySelectedCalendarIdsBetween).toHaveBeenCalledWith(
        ["cal-1"],
        new Date("2025-01-01"),
        new Date("2025-01-02")
      );
      expect(mockOriginalCalendar.getAvailability).toHaveBeenCalledWith({
        dateFrom: "2025-01-01",
        dateTo: "2025-01-02",
        selectedCalendars: [selectedCalendars[1]],
        mode: "slots",
        fallbackToPrimary: undefined,
      });
    });

    it("should filter out calendars without id when fetching from cache", async () => {
      const selectedCalendars: IntegrationCalendar[] = [
        {
          id: "cal-1",
          externalId: "ext-1",
          integration: "google_calendar",
          syncToken: "token-1",
          syncSubscribedAt: new Date(),
        },
        {
          id: null,
          externalId: "ext-2",
          integration: "google_calendar",
          syncToken: "token-2",
          syncSubscribedAt: new Date(),
        },
      ];

      await wrapper.getAvailability({
        dateFrom: "2025-01-01",
        dateTo: "2025-01-02",
        selectedCalendars,
        mode: "slots",
      });

      expect(mockRepository.findAllBySelectedCalendarIdsBetween).toHaveBeenCalledWith(
        ["cal-1"], // Only cal-1 has a valid id
        new Date("2025-01-01"),
        new Date("2025-01-02")
      );
    });
  });

  describe("getAvailabilityWithTimeZones", () => {
    it("should return empty array when no calendars provided", async () => {
      const result = await wrapper.getAvailabilityWithTimeZones({
        dateFrom: "2025-01-01",
        dateTo: "2025-01-02",
        selectedCalendars: [],
        mode: "slots",
      });

      expect(result).toEqual([]);
      expect(mockRepository.findAllBySelectedCalendarIdsBetween).not.toHaveBeenCalled();
      expect(mockOriginalCalendar.getAvailabilityWithTimeZones).not.toHaveBeenCalled();
    });

    it("should fetch only from cache and apply UTC default timezone when all calendars are synced", async () => {
      const selectedCalendars: IntegrationCalendar[] = [
        {
          id: "cal-1",
          externalId: "ext-1",
          integration: "google_calendar",
          syncToken: "token-1",
          syncSubscribedAt: new Date(),
        },
      ];

      const cachedEvents: EventBusyDate[] = [
        {
          start: new Date("2025-01-01T10:00:00Z"),
          end: new Date("2025-01-01T11:00:00Z"),
          timeZone: "America/New_York",
        },
        {
          start: new Date("2025-01-01T14:00:00Z"),
          end: new Date("2025-01-01T15:00:00Z"),
          timeZone: null, // Should default to UTC
        },
      ];

      vi.mocked(mockRepository.findAllBySelectedCalendarIdsBetween).mockResolvedValue(cachedEvents);

      const result = await wrapper.getAvailabilityWithTimeZones({
        dateFrom: "2025-01-01",
        dateTo: "2025-01-02",
        selectedCalendars,
        mode: "slots",
      });

      expect(result).toEqual([
        {
          start: cachedEvents[0].start,
          end: cachedEvents[0].end,
          timeZone: "America/New_York",
        },
        {
          start: cachedEvents[1].start,
          end: cachedEvents[1].end,
          timeZone: "UTC", // Default applied
        },
      ]);
      expect(mockOriginalCalendar.getAvailabilityWithTimeZones).not.toHaveBeenCalled();
    });

    it("should fetch only from original calendar when all calendars are unsynced", async () => {
      const selectedCalendars: IntegrationCalendar[] = [
        {
          id: "cal-1",
          externalId: "ext-1",
          integration: "google_calendar",
          syncToken: null,
          syncSubscribedAt: null,
        },
      ];

      const originalEvents = [
        {
          start: new Date("2025-01-01T09:00:00Z"),
          end: new Date("2025-01-01T10:00:00Z"),
          timeZone: "Europe/London",
        },
      ];

      vi.mocked(mockOriginalCalendar.getAvailabilityWithTimeZones).mockResolvedValue(originalEvents);

      const result = await wrapper.getAvailabilityWithTimeZones({
        dateFrom: "2025-01-01",
        dateTo: "2025-01-02",
        selectedCalendars,
        mode: "slots",
      });

      expect(result).toEqual(originalEvents);
      expect(mockRepository.findAllBySelectedCalendarIdsBetween).not.toHaveBeenCalled();
      expect(mockOriginalCalendar.getAvailabilityWithTimeZones).toHaveBeenCalledWith({
        dateFrom: "2025-01-01",
        dateTo: "2025-01-02",
        selectedCalendars,
        mode: "slots",
        fallbackToPrimary: undefined,
      });
    });

    it("should fetch from both cache and original calendar when calendars are mixed", async () => {
      const selectedCalendars: IntegrationCalendar[] = [
        {
          id: "cal-1",
          externalId: "ext-1",
          integration: "google_calendar",
          syncToken: "token-1",
          syncSubscribedAt: new Date(),
        },
        {
          id: "cal-2",
          externalId: "ext-2",
          integration: "google_calendar",
          syncToken: null,
          syncSubscribedAt: null,
        },
      ];

      const cachedEvents: EventBusyDate[] = [
        {
          start: new Date("2025-01-01T10:00:00Z"),
          end: new Date("2025-01-01T11:00:00Z"),
          timeZone: "America/New_York",
        },
      ];

      const originalEvents = [
        {
          start: new Date("2025-01-01T14:00:00Z"),
          end: new Date("2025-01-01T15:00:00Z"),
          timeZone: "Europe/London",
        },
      ];

      vi.mocked(mockRepository.findAllBySelectedCalendarIdsBetween).mockResolvedValue(cachedEvents);
      vi.mocked(mockOriginalCalendar.getAvailabilityWithTimeZones).mockResolvedValue(originalEvents);

      const result = await wrapper.getAvailabilityWithTimeZones({
        dateFrom: "2025-01-01",
        dateTo: "2025-01-02",
        selectedCalendars,
        mode: "slots",
      });

      expect(result).toEqual([
        {
          start: cachedEvents[0].start,
          end: cachedEvents[0].end,
          timeZone: "America/New_York",
        },
        ...originalEvents,
      ]);
    });

    it("should handle when originalCalendar.getAvailabilityWithTimeZones is undefined", async () => {
      const selectedCalendars: IntegrationCalendar[] = [
        {
          id: "cal-1",
          externalId: "ext-1",
          integration: "google_calendar",
          syncToken: "token-1",
          syncSubscribedAt: new Date(),
        },
        {
          id: "cal-2",
          externalId: "ext-2",
          integration: "google_calendar",
          syncToken: null,
          syncSubscribedAt: null,
        },
      ];

      const cachedEvents: EventBusyDate[] = [
        {
          start: new Date("2025-01-01T10:00:00Z"),
          end: new Date("2025-01-01T11:00:00Z"),
          timeZone: "UTC",
        },
      ];

      vi.mocked(mockRepository.findAllBySelectedCalendarIdsBetween).mockResolvedValue(cachedEvents);
      mockOriginalCalendar.getAvailabilityWithTimeZones = undefined;

      const result = await wrapper.getAvailabilityWithTimeZones({
        dateFrom: "2025-01-01",
        dateTo: "2025-01-02",
        selectedCalendars,
        mode: "slots",
      });

      expect(result).toEqual([
        {
          start: cachedEvents[0].start,
          end: cachedEvents[0].end,
          timeZone: "UTC",
        },
      ]);
    });

    it("should handle when originalCalendar.getAvailabilityWithTimeZones returns empty array", async () => {
      const selectedCalendars: IntegrationCalendar[] = [
        {
          id: "cal-1",
          externalId: "ext-1",
          integration: "google_calendar",
          syncToken: null,
          syncSubscribedAt: null,
        },
      ];

      vi.mocked(mockOriginalCalendar.getAvailabilityWithTimeZones).mockResolvedValue([]);

      const result = await wrapper.getAvailabilityWithTimeZones({
        dateFrom: "2025-01-01",
        dateTo: "2025-01-02",
        selectedCalendars,
        mode: "slots",
      });

      expect(result).toEqual([]);
    });
  });

  describe("other Calendar methods", () => {
    it("should delegate createEvent to original calendar", async () => {
      const mockEvent: CalendarServiceEvent = {
        title: "Test Event",
        startTime: "2025-01-01T10:00:00Z",
        endTime: "2025-01-01T11:00:00Z",
      };
      const mockResult: NewCalendarEventType = {
        uid: "test-uid",
        id: "test-id",
        type: "test-type",
        password: "",
        url: "",
        additionalInfo: {},
      };

      vi.mocked(mockOriginalCalendar.createEvent).mockResolvedValue(mockResult);

      const result = await wrapper.createEvent(mockEvent, 123, "cal-id");

      expect(result).toBe(mockResult);
      expect(mockOriginalCalendar.createEvent).toHaveBeenCalledWith(mockEvent, 123, "cal-id");
    });

    it("should delegate updateEvent to original calendar", async () => {
      const mockEvent: CalendarServiceEvent = {
        title: "Updated Event",
        startTime: "2025-01-01T10:00:00Z",
        endTime: "2025-01-01T11:00:00Z",
      };
      const mockResult: NewCalendarEventType = {
        uid: "test-uid",
        id: "test-id",
        type: "test-type",
        password: "",
        url: "",
        additionalInfo: {},
      };

      vi.mocked(mockOriginalCalendar.updateEvent).mockResolvedValue(mockResult);

      const result = await wrapper.updateEvent("uid-123", mockEvent, "cal-id");

      expect(result).toBe(mockResult);
      expect(mockOriginalCalendar.updateEvent).toHaveBeenCalledWith("uid-123", mockEvent, "cal-id");
    });

    it("should delegate deleteEvent to original calendar", async () => {
      const mockEvent: CalendarEvent = {
        uid: "test-uid",
        title: "Test Event",
        startTime: "2025-01-01T10:00:00Z",
        endTime: "2025-01-01T11:00:00Z",
      };

      vi.mocked(mockOriginalCalendar.deleteEvent).mockResolvedValue(undefined);

      await wrapper.deleteEvent("uid-123", mockEvent, "cal-id");

      expect(mockOriginalCalendar.deleteEvent).toHaveBeenCalledWith("uid-123", mockEvent, "cal-id");
    });

    it("should delegate listCalendars to original calendar", async () => {
      const mockCalendars: IntegrationCalendar[] = [
        {
          id: "cal-1",
          externalId: "ext-1",
          integration: "google_calendar",
        },
      ];

      vi.mocked(mockOriginalCalendar.listCalendars).mockResolvedValue(mockCalendars);

      const result = await wrapper.listCalendars();

      expect(result).toBe(mockCalendars);
      expect(mockOriginalCalendar.listCalendars).toHaveBeenCalled();
    });
  });
});
