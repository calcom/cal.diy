/**
 * Virtual mocks are required because UnifiedCalendarService (imported transitively
 * for DI token resolution) has runtime imports from @calcom/platform-libraries and
 * @calcom/platform-libraries/app-store whose transitive dependencies (prisma, DB,
 * Google APIs) cannot be resolved in Jest.
 * The service is fully mocked via useValue so these packages are never executed.
 */
jest.mock(
  "@calcom/platform-libraries/app-store",
  () => ({
    DelegationCredentialRepository: {
      findByIdIncludeSensitiveServiceAccountKey: jest.fn().mockResolvedValue(null),
    },
    OAuth2UniversalSchema: { parse: jest.fn((v: unknown) => v) },
  }),
  { virtual: true }
);
jest.mock(
  "@calcom/platform-libraries",
  () => ({
    getBusyCalendarTimes: jest.fn(),
    getConnectedDestinationCalendarsAndEnsureDefaultsInDb: jest.fn(),
    credentialForCalendarServiceSelect: {},
  }),
  { virtual: true }
);

import { GOOGLE_CALENDAR, SUCCESS_STATUS } from "@calcom/platform-constants";
import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { CalUnifiedCalendarsController } from "./cal-unified-calendars.controller";
import { ApiAuthGuard } from "@/modules/auth/guards/api-auth/api-auth.guard";
import { PermissionsGuard } from "@/modules/auth/guards/permissions/permissions.guard";
import { UnifiedCalendarService } from "@/modules/cal-unified-calendars/services/unified-calendar.service";

describe("CalUnifiedCalendarsController", () => {
  let controller: CalUnifiedCalendarsController;
  let mockUnifiedCalendarService: Record<string, jest.Mock>;

  const userId = 42;

  beforeEach(async () => {
    mockUnifiedCalendarService = {
      getConnections: jest.fn(),
      getEventDetails: jest.fn(),
      updateEventDetails: jest.fn(),
      listEvents: jest.fn(),
      createEvent: jest.fn(),
      deleteEvent: jest.fn(),
      getFreeBusy: jest.fn(),
      listConnectionEvents: jest.fn(),
      createConnectionEvent: jest.fn(),
      getConnectionEvent: jest.fn(),
      updateConnectionEvent: jest.fn(),
      deleteConnectionEvent: jest.fn(),
      getConnectionFreeBusy: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CalUnifiedCalendarsController],
      providers: [{ provide: UnifiedCalendarService, useValue: mockUnifiedCalendarService }],
    })
      .overrideGuard(ApiAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CalUnifiedCalendarsController>(CalUnifiedCalendarsController);
  });

  describe("listConnections", () => {
    it("should return connections from unified calendar service", async () => {
      const connections = [
        { connectionId: "1", type: "google" as const, email: "user@gmail.com" },
        { connectionId: "2", type: "office365" as const, email: "user@outlook.com" },
      ];
      mockUnifiedCalendarService.getConnections.mockResolvedValue(connections);

      const result = await controller.listConnections(userId);

      expect(result.status).toBe(SUCCESS_STATUS);
      expect(result.data.connections).toEqual(connections);
      expect(mockUnifiedCalendarService.getConnections).toHaveBeenCalledWith(userId);
    });

    it("should return empty connections array when user has no calendars", async () => {
      mockUnifiedCalendarService.getConnections.mockResolvedValue([]);

      const result = await controller.listConnections(userId);

      expect(result.status).toBe(SUCCESS_STATUS);
      expect(result.data.connections).toEqual([]);
    });

    it("should strip credential key even if service accidentally includes it (defense-in-depth)", async () => {
      const connectionsWithKey = [
        {
          connectionId: "1",
          type: "google" as const,
          email: "user@gmail.com",
          key: { access_token: "SECRET_TOKEN", refresh_token: "SECRET_REFRESH" },
        },
      ];
      mockUnifiedCalendarService.getConnections.mockResolvedValue(connectionsWithKey);

      const result = await controller.listConnections(userId);
      const conn = result.data.connections[0];
      const serialized = JSON.stringify(result);

      expect(conn).toHaveProperty("connectionId", "1");
      expect(conn).toHaveProperty("type", "google");
      expect(conn).toHaveProperty("email", "user@gmail.com");
      expect(conn).not.toHaveProperty("key");
      expect(serialized).not.toContain("SECRET_TOKEN");
      expect(serialized).not.toContain("SECRET_REFRESH");
      expect(Object.keys(conn)).toEqual(["connectionId", "type", "email"]);
    });
  });

  describe("listConnectionEvents", () => {
    it("should list events for a valid connection", async () => {
      const transformedEvents = [
        {
          eventId: "event-1",
          status: "confirmed",
          title: "Meeting",
          start: { time: "2024-01-15T10:00:00Z", timeZone: "UTC" },
          end: { time: "2024-01-15T11:00:00Z", timeZone: "UTC" },
        },
      ];
      mockUnifiedCalendarService.listConnectionEvents.mockResolvedValue(transformedEvents);

      // ParseConnectionIdPipe transforms string "10" to number 10 before it reaches the controller
      const result = await controller.listConnectionEvents(10, userId, {
        from: "2024-01-01",
        to: "2024-01-31",
      });

      expect(result.status).toBe(SUCCESS_STATUS);
      expect(result.data).toHaveLength(1);
      expect(mockUnifiedCalendarService.listConnectionEvents).toHaveBeenCalledWith(
        userId,
        10,
        "primary",
        "2024-01-01T00:00:00.000Z",
        "2024-01-31T23:59:59.999Z"
      );
    });

    it("should pass ISO datetime strings directly without modification", async () => {
      mockUnifiedCalendarService.listConnectionEvents.mockResolvedValue([]);

      await controller.listConnectionEvents(10, userId, {
        from: "2024-01-01T09:00:00Z",
        to: "2024-01-31T17:00:00Z",
      });

      expect(mockUnifiedCalendarService.listConnectionEvents).toHaveBeenCalledWith(
        userId,
        10,
        "primary",
        "2024-01-01T09:00:00Z",
        "2024-01-31T17:00:00Z"
      );
    });

    it("should use provided calendarId when specified", async () => {
      mockUnifiedCalendarService.listConnectionEvents.mockResolvedValue([]);

      await controller.listConnectionEvents(10, userId, {
        from: "2024-01-01",
        to: "2024-01-31",
        calendarId: "custom@group.calendar.google.com",
      });

      expect(mockUnifiedCalendarService.listConnectionEvents).toHaveBeenCalledWith(
        userId,
        10,
        "custom@group.calendar.google.com",
        expect.any(String),
        expect.any(String)
      );
    });
  });

  describe("createConnectionEvent", () => {
    const body = {
      title: "New Event",
      start: { time: "2024-01-15T10:00:00Z", timeZone: "America/New_York" },
      end: { time: "2024-01-15T11:00:00Z", timeZone: "America/New_York" },
    };

    it("should create event for a valid connection", async () => {
      const transformedEvent = {
        eventId: "new-event-id",
        status: "confirmed",
        title: "New Event",
        start: { time: "2024-01-15T10:00:00Z", timeZone: "America/New_York" },
        end: { time: "2024-01-15T11:00:00Z", timeZone: "America/New_York" },
      };
      mockUnifiedCalendarService.createConnectionEvent.mockResolvedValue(transformedEvent);

      const result = await controller.createConnectionEvent(10, userId, body);

      expect(result.status).toBe(SUCCESS_STATUS);
      expect(result.data).toBeDefined();
      expect(mockUnifiedCalendarService.createConnectionEvent).toHaveBeenCalledWith(
        userId,
        10,
        "primary",
        body
      );
    });

    it("should use custom calendarId when provided", async () => {
      const transformedEvent = {
        eventId: "new-event-id",
        status: "confirmed",
        title: "New Event",
        start: { time: "2024-01-15T10:00:00Z", timeZone: "America/New_York" },
        end: { time: "2024-01-15T11:00:00Z", timeZone: "America/New_York" },
      };
      mockUnifiedCalendarService.createConnectionEvent.mockResolvedValue(transformedEvent);

      await controller.createConnectionEvent(10, userId, body, "custom@group.calendar.google.com");

      expect(mockUnifiedCalendarService.createConnectionEvent).toHaveBeenCalledWith(
        userId,
        10,
        "custom@group.calendar.google.com",
        body
      );
    });
  });

  describe("getConnectionEvent", () => {
    it("should get a single event by ID", async () => {
      const transformedEvent = {
        eventId: "event-1",
        status: "confirmed",
        title: "Test",
        start: { time: "2024-01-15T10:00:00Z", timeZone: "UTC" },
        end: { time: "2024-01-15T11:00:00Z", timeZone: "UTC" },
      };
      mockUnifiedCalendarService.getConnectionEvent.mockResolvedValue(transformedEvent);

      const result = await controller.getConnectionEvent(10, "event-1", userId);

      expect(result.status).toBe(SUCCESS_STATUS);
      expect(mockUnifiedCalendarService.getConnectionEvent).toHaveBeenCalledWith(
        userId,
        10,
        "primary",
        "event-1"
      );
    });

    it("should use custom calendarId when provided", async () => {
      mockUnifiedCalendarService.getConnectionEvent.mockResolvedValue({
        eventId: "e",
        start: { time: "2024-01-15T10:00:00Z", timeZone: "UTC" },
        end: { time: "2024-01-15T11:00:00Z", timeZone: "UTC" },
      });

      await controller.getConnectionEvent(10, "event-1", userId, "custom@calendar");

      expect(mockUnifiedCalendarService.getConnectionEvent).toHaveBeenCalledWith(
        userId,
        10,
        "custom@calendar",
        "event-1"
      );
    });
  });

  describe("updateConnectionEvent", () => {
    it("should update event for a valid connection", async () => {
      const updateData = { title: "Updated Title" };
      const transformedEvent = {
        eventId: "event-1",
        title: "Updated Title",
        start: { time: "2024-01-15T10:00:00Z", timeZone: "UTC" },
        end: { time: "2024-01-15T11:00:00Z", timeZone: "UTC" },
      };
      mockUnifiedCalendarService.updateConnectionEvent.mockResolvedValue(transformedEvent);

      const result = await controller.updateConnectionEvent(10, "event-1", userId, updateData);

      expect(result.status).toBe(SUCCESS_STATUS);
      expect(mockUnifiedCalendarService.updateConnectionEvent).toHaveBeenCalledWith(
        userId,
        10,
        "primary",
        "event-1",
        updateData
      );
    });
  });

  describe("deleteConnectionEvent", () => {
    it("should delete event for a valid connection", async () => {
      mockUnifiedCalendarService.deleteConnectionEvent.mockResolvedValue(undefined);

      await controller.deleteConnectionEvent(10, "event-1", userId);

      expect(mockUnifiedCalendarService.deleteConnectionEvent).toHaveBeenCalledWith(
        userId,
        10,
        "primary",
        "event-1"
      );
    });
  });

  describe("getConnectionFreeBusy", () => {
    it("should return busy times for a connection", async () => {
      const busyData = [{ start: new Date("2024-01-15T10:00:00Z"), end: new Date("2024-01-15T11:00:00Z") }];
      mockUnifiedCalendarService.getConnectionFreeBusy.mockResolvedValue(busyData);

      const result = await controller.getConnectionFreeBusy(10, userId, {
        from: "2024-01-01T00:00:00Z",
        to: "2024-01-31T23:59:59Z",
        timeZone: "America/New_York",
      });

      expect(result.status).toBe(SUCCESS_STATUS);
      expect(result.data).toEqual(busyData);
      expect(mockUnifiedCalendarService.getConnectionFreeBusy).toHaveBeenCalledWith(
        userId,
        10,
        "2024-01-01T00:00:00Z",
        "2024-01-31T23:59:59Z",
        "America/New_York"
      );
    });

    it("should default timezone to UTC when not provided", async () => {
      mockUnifiedCalendarService.getConnectionFreeBusy.mockResolvedValue([]);

      await controller.getConnectionFreeBusy(10, userId, {
        from: "2024-01-01T00:00:00Z",
        to: "2024-01-31T23:59:59Z",
      });

      expect(mockUnifiedCalendarService.getConnectionFreeBusy).toHaveBeenCalledWith(
        userId,
        10,
        "2024-01-01T00:00:00Z",
        "2024-01-31T23:59:59Z",
        "UTC"
      );
    });
  });

  describe("getCalendarEventDetails (user-scoped)", () => {
    it("should return event details for Google Calendar", async () => {
      const transformedEvent = {
        eventId: "event-uid",
        status: "confirmed",
        title: "Test Meeting",
        start: { time: "2024-01-15T10:00:00Z", timeZone: "UTC" },
        end: { time: "2024-01-15T11:00:00Z", timeZone: "UTC" },
      };
      mockUnifiedCalendarService.getEventDetails.mockResolvedValue(transformedEvent);

      const result = await controller.getCalendarEventDetails(GOOGLE_CALENDAR, "event-uid");

      expect(result.status).toBe(SUCCESS_STATUS);
      expect(result.data).toBeDefined();
      expect(mockUnifiedCalendarService.getEventDetails).toHaveBeenCalledWith(GOOGLE_CALENDAR, "event-uid");
    });

    it("should propagate BadRequestException for non-Google calendar", async () => {
      mockUnifiedCalendarService.getEventDetails.mockRejectedValue(
        new BadRequestException("Meeting details is currently only available for Google Calendar.")
      );

      await expect(controller.getCalendarEventDetails("office365", "event-uid")).rejects.toThrow(
        BadRequestException
      );
    });
  });

  describe("updateCalendarEvent (user-scoped)", () => {
    it("should update event for Google Calendar", async () => {
      const updateData = { title: "Updated" };
      const transformedEvent = {
        eventId: "event-uid",
        title: "Updated",
        start: { time: "2024-01-15T10:00:00Z", timeZone: "UTC" },
        end: { time: "2024-01-15T11:00:00Z", timeZone: "UTC" },
      };
      mockUnifiedCalendarService.updateEventDetails.mockResolvedValue(transformedEvent);

      const result = await controller.updateCalendarEvent(GOOGLE_CALENDAR, "event-uid", updateData);

      expect(result.status).toBe(SUCCESS_STATUS);
      expect(mockUnifiedCalendarService.updateEventDetails).toHaveBeenCalledWith(
        GOOGLE_CALENDAR,
        "event-uid",
        updateData
      );
    });

    it("should propagate BadRequestException for non-Google calendar", async () => {
      mockUnifiedCalendarService.updateEventDetails.mockRejectedValue(
        new BadRequestException("Event updates is currently only available for Google Calendar.")
      );

      await expect(controller.updateCalendarEvent("office365", "event-uid", { title: "t" })).rejects.toThrow(
        BadRequestException
      );
    });
  });

  describe("deprecated singular /event/ path aliases", () => {
    it("getCalendarEventDetailsByDeprecatedPath should behave like the plural path", async () => {
      const transformedEvent = {
        eventId: "event-uid",
        status: "confirmed",
        title: "Test Meeting",
        start: { time: "2024-01-15T10:00:00Z", timeZone: "UTC" },
        end: { time: "2024-01-15T11:00:00Z", timeZone: "UTC" },
      };
      mockUnifiedCalendarService.getEventDetails.mockResolvedValue(transformedEvent);

      const result = await controller.getCalendarEventDetailsByDeprecatedPath(GOOGLE_CALENDAR, "event-uid");

      expect(result.status).toBe(SUCCESS_STATUS);
      expect(result.data).toBeDefined();
      expect(mockUnifiedCalendarService.getEventDetails).toHaveBeenCalledWith(GOOGLE_CALENDAR, "event-uid");
    });

    it("updateCalendarEventByDeprecatedPath should behave like the plural path", async () => {
      const updateData = { title: "Updated" };
      const transformedEvent = {
        eventId: "event-uid",
        title: "Updated",
        start: { time: "2024-01-15T10:00:00Z", timeZone: "UTC" },
        end: { time: "2024-01-15T11:00:00Z", timeZone: "UTC" },
      };
      mockUnifiedCalendarService.updateEventDetails.mockResolvedValue(transformedEvent);

      const result = await controller.updateCalendarEventByDeprecatedPath(
        GOOGLE_CALENDAR,
        "event-uid",
        updateData
      );

      expect(result.status).toBe(SUCCESS_STATUS);
      expect(mockUnifiedCalendarService.updateEventDetails).toHaveBeenCalledWith(
        GOOGLE_CALENDAR,
        "event-uid",
        updateData
      );
    });

    it("should propagate errors from the deprecated aliases", async () => {
      mockUnifiedCalendarService.getEventDetails.mockRejectedValue(
        new BadRequestException("Meeting details is currently only available for Google Calendar.")
      );

      await expect(
        controller.getCalendarEventDetailsByDeprecatedPath("office365", "event-uid")
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("listCalendarEvents (user-scoped)", () => {
    it("should list events for Google Calendar", async () => {
      mockUnifiedCalendarService.listEvents.mockResolvedValue([]);

      const result = await controller.listCalendarEvents(GOOGLE_CALENDAR, userId, {
        from: "2024-01-01",
        to: "2024-01-31",
      });

      expect(result.status).toBe(SUCCESS_STATUS);
      expect(result.data).toEqual([]);
    });

    it("should propagate BadRequestException for non-Google calendar", async () => {
      mockUnifiedCalendarService.listEvents.mockRejectedValue(
        new BadRequestException("List events is currently only available for Google Calendar.")
      );

      await expect(
        controller.listCalendarEvents("office365", userId, {
          from: "2024-01-01",
          to: "2024-01-31",
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("createCalendarEvent (user-scoped)", () => {
    const body = {
      title: "New Event",
      start: { time: "2024-01-15T10:00:00Z", timeZone: "America/New_York" },
      end: { time: "2024-01-15T11:00:00Z", timeZone: "America/New_York" },
    };

    it("should create event for Google Calendar", async () => {
      const transformedEvent = {
        eventId: "new-id",
        title: "New Event",
        start: { time: "2024-01-15T10:00:00Z", timeZone: "America/New_York" },
        end: { time: "2024-01-15T11:00:00Z", timeZone: "America/New_York" },
      };
      mockUnifiedCalendarService.createEvent.mockResolvedValue(transformedEvent);

      const result = await controller.createCalendarEvent(GOOGLE_CALENDAR, userId, body);

      expect(result.status).toBe(SUCCESS_STATUS);
      expect(mockUnifiedCalendarService.createEvent).toHaveBeenCalledWith(
        GOOGLE_CALENDAR,
        userId,
        "primary",
        body
      );
    });

    it("should propagate BadRequestException for non-Google calendar", async () => {
      mockUnifiedCalendarService.createEvent.mockRejectedValue(
        new BadRequestException("Create event is currently only available for Google Calendar.")
      );

      await expect(controller.createCalendarEvent("apple", userId, body)).rejects.toThrow(
        BadRequestException
      );
    });
  });

  describe("deleteCalendarEvent (user-scoped)", () => {
    it("should delete event for Google Calendar", async () => {
      mockUnifiedCalendarService.deleteEvent.mockResolvedValue(undefined);

      await controller.deleteCalendarEvent(GOOGLE_CALENDAR, "event-uid", userId);

      expect(mockUnifiedCalendarService.deleteEvent).toHaveBeenCalledWith(
        GOOGLE_CALENDAR,
        userId,
        "primary",
        "event-uid"
      );
    });

    it("should propagate BadRequestException for non-Google calendar", async () => {
      mockUnifiedCalendarService.deleteEvent.mockRejectedValue(
        new BadRequestException("Delete event is currently only available for Google Calendar.")
      );

      await expect(controller.deleteCalendarEvent("office365", "event-uid", userId)).rejects.toThrow(
        BadRequestException
      );
    });
  });

  describe("getFreeBusy (user-scoped)", () => {
    it("should return busy times for Google Calendar", async () => {
      const busyData = [{ start: new Date(), end: new Date() }];
      mockUnifiedCalendarService.getFreeBusy.mockResolvedValue(busyData);

      const result = await controller.getFreeBusy(GOOGLE_CALENDAR, userId, {
        from: "2024-01-01T00:00:00Z",
        to: "2024-01-31T23:59:59Z",
        timeZone: "America/New_York",
      });

      expect(result.status).toBe(SUCCESS_STATUS);
      expect(result.data).toEqual(busyData);
      expect(mockUnifiedCalendarService.getFreeBusy).toHaveBeenCalledWith(
        GOOGLE_CALENDAR,
        userId,
        "2024-01-01T00:00:00Z",
        "2024-01-31T23:59:59Z",
        "America/New_York"
      );
    });

    it("should default timezone to UTC when not provided", async () => {
      mockUnifiedCalendarService.getFreeBusy.mockResolvedValue([]);

      await controller.getFreeBusy(GOOGLE_CALENDAR, userId, {
        from: "2024-01-01T00:00:00Z",
        to: "2024-01-31T23:59:59Z",
      });

      expect(mockUnifiedCalendarService.getFreeBusy).toHaveBeenCalledWith(
        GOOGLE_CALENDAR,
        userId,
        "2024-01-01T00:00:00Z",
        "2024-01-31T23:59:59Z",
        "UTC"
      );
    });

    it("should propagate BadRequestException for non-Google calendar", async () => {
      mockUnifiedCalendarService.getFreeBusy.mockRejectedValue(
        new BadRequestException("Free/busy is currently only available for Google Calendar.")
      );

      await expect(
        controller.getFreeBusy("office365", userId, {
          from: "2024-01-01",
          to: "2024-01-31",
        })
      ).rejects.toThrow(BadRequestException);
    });
  });
});
