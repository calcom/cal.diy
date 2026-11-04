import { OrganizerDefaultConferencingAppType } from "@calcom/app-store/locations";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getBookingData } from "./getBookingData";
import type { getEventTypeResponse } from "./getEventTypesFromDB";

// Mock the dependencies
vi.mock("@calcom/features/bookings/lib/getCalEventResponses", () => ({
  getCalEventResponses: vi.fn().mockReturnValue({
    userFieldsResponses: {},
    responses: {},
  }),
}));

vi.mock("@calcom/lib/sentryWrapper", () => ({
  withReporting: (fn: Function) => fn,
}));

const createMockEventType = (overrides: Partial<getEventTypeResponse> = {}): getEventTypeResponse => {
  return {
    id: 1,
    length: 30,
    bookingFields: [
      { name: "name", type: "name", required: true },
      { name: "email", type: "email", required: true },
      { name: "location", type: "radioInput", required: false },
    ],
    customInputs: [],
    seatsPerTimeSlot: null,
    ...overrides,
  } as getEventTypeResponse;
};

const createMockSchema = () => {
  return z.object({
    eventTypeId: z.number(),
    start: z.string(),
    end: z.string().optional(),
    timeZone: z.string(),
    language: z.string(),
    metadata: z.record(z.string()),
    responses: z.object({
      name: z.string(),
      email: z.string(),
      location: z
        .union([
          z.string(),
          z.object({
            value: z.string(),
            optionValue: z.string().optional(),
          }),
        ])
        .optional(),
      attendeePhoneNumber: z.string().optional(),
      guests: z.array(z.string()).optional(),
      smsReminderNumber: z.string().optional(),
      notes: z.string().optional(),
      rescheduleReason: z.string().optional(),
    }),
  });
};

describe("getBookingData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("location extraction", () => {
    it("should ignore optionValue when location type is OrganizerDefaultConferencingAppType", async () => {
      const mockEventType = createMockEventType();
      const schema = createMockSchema();

      const reqBody = {
        eventTypeId: 1,
        start: "2024-01-15T10:00:00.000Z",
        end: "2024-01-15T10:30:00.000Z",
        timeZone: "America/New_York",
        language: "en",
        metadata: {},
        responses: {
          name: "Test User",
          email: "test@example.com",
          location: {
            value: OrganizerDefaultConferencingAppType, // "conferencing"
            optionValue: "+15551234567", // Phone number that should be ignored
          },
        },
      };

      const result = await getBookingData({
        reqBody,
        eventType: mockEventType,
        schema,
      });

      // The location should be the conferencing type, NOT the phone number
      expect(result.location).toBe(OrganizerDefaultConferencingAppType);
      expect(result.location).not.toBe("+15551234567");
    });

    it("should use optionValue for non-OrganizerDefaultConferencingAppType locations", async () => {
      const mockEventType = createMockEventType();
      const schema = createMockSchema();

      const reqBody = {
        eventTypeId: 1,
        start: "2024-01-15T10:00:00.000Z",
        end: "2024-01-15T10:30:00.000Z",
        timeZone: "America/New_York",
        language: "en",
        metadata: {},
        responses: {
          name: "Test User",
          email: "test@example.com",
          location: {
            value: "phone",
            optionValue: "+15551234567",
          },
        },
      };

      const result = await getBookingData({
        reqBody,
        eventType: mockEventType,
        schema,
      });

      // For phone location type, optionValue should be used
      expect(result.location).toBe("+15551234567");
    });

    it("should fall back to value when optionValue is empty for non-conferencing locations", async () => {
      const mockEventType = createMockEventType();
      const schema = createMockSchema();

      const reqBody = {
        eventTypeId: 1,
        start: "2024-01-15T10:00:00.000Z",
        end: "2024-01-15T10:30:00.000Z",
        timeZone: "America/New_York",
        language: "en",
        metadata: {},
        responses: {
          name: "Test User",
          email: "test@example.com",
          location: {
            value: "integrations:daily",
            optionValue: "",
          },
        },
      };

      const result = await getBookingData({
        reqBody,
        eventType: mockEventType,
        schema,
      });

      // Should fall back to value when optionValue is empty
      expect(result.location).toBe("integrations:daily");
    });

    it("should return empty string when location is not provided", async () => {
      const mockEventType = createMockEventType();
      const schema = createMockSchema();

      const reqBody = {
        eventTypeId: 1,
        start: "2024-01-15T10:00:00.000Z",
        end: "2024-01-15T10:30:00.000Z",
        timeZone: "America/New_York",
        language: "en",
        metadata: {},
        responses: {
          name: "Test User",
          email: "test@example.com",
          // No location provided
        },
      };

      const result = await getBookingData({
        reqBody,
        eventType: mockEventType,
        schema,
      });

      expect(result.location).toBe("");
    });

    it("should use OrganizerDefaultConferencingAppType value even when optionValue contains meeting URL", async () => {
      const mockEventType = createMockEventType();
      const schema = createMockSchema();

      const reqBody = {
        eventTypeId: 1,
        start: "2024-01-15T10:00:00.000Z",
        end: "2024-01-15T10:30:00.000Z",
        timeZone: "America/New_York",
        language: "en",
        metadata: {},
        responses: {
          name: "Test User",
          email: "test@example.com",
          location: {
            value: OrganizerDefaultConferencingAppType,
            optionValue: "https://meet.google.com/abc-defg-hij", // Should be ignored
          },
        },
      };

      const result = await getBookingData({
        reqBody,
        eventType: mockEventType,
        schema,
      });

      // The location should be the conferencing type, NOT the URL
      expect(result.location).toBe(OrganizerDefaultConferencingAppType);
    });

    it("should handle location when passed as a plain string identifier", async () => {
      const mockEventType = createMockEventType();
      const schema = createMockSchema();

      const reqBody = {
        eventTypeId: 1,
        start: "2024-01-15T10:00:00.000Z",
        end: "2024-01-15T10:30:00.000Z",
        timeZone: "America/New_York",
        language: "en",
        metadata: {},
        responses: {
          name: "Test User",
          email: "test@example.com",
          location: "integrations:signal_video",
        },
      };

      const result = await getBookingData({
        reqBody,
        eventType: mockEventType,
        schema,
      });

      expect(result.location).toBe("integrations:signal_video");
    });

    it("should handle location as plain string when value is OrganizerDefaultConferencingAppType", async () => {
      const mockEventType = createMockEventType();
      const schema = createMockSchema();

      const reqBody = {
        eventTypeId: 1,
        start: "2024-01-15T10:00:00.000Z",
        end: "2024-01-15T10:30:00.000Z",
        timeZone: "America/New_York",
        language: "en",
        metadata: {},
        responses: {
          name: "Test User",
          email: "test@example.com",
          location: OrganizerDefaultConferencingAppType,
        },
      };

      const result = await getBookingData({
        reqBody,
        eventType: mockEventType,
        schema,
      });

      expect(result.location).toBe(OrganizerDefaultConferencingAppType);
    });
  });
});
