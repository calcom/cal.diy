import { expect, test, vi, describe, beforeEach } from "vitest";

import type { CalendarEvent } from "@calcom/types/Calendar";
import type { CredentialPayload } from "@calcom/types/Credential";

import config from "../config.json";
import type { KyzonCredentialKey } from "./KyzonCredentialKey";
import KyzonVideoApiAdapter from "./VideoApiAdapter";
// Import mocked functions after they're mocked
import { kyzonAxiosInstance } from "./axios";
import { refreshKyzonToken, isTokenExpired } from "./tokenManager";

// Mock axios
vi.mock("./axios", () => ({
  kyzonAxiosInstance: {
    post: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock token manager
vi.mock("./tokenManager", () => ({
  refreshKyzonToken: vi.fn(),
  isTokenExpired: vi.fn(),
}));

const mockPost = vi.mocked(kyzonAxiosInstance.post);
const mockGet = vi.mocked(kyzonAxiosInstance.get);
const mockPut = vi.mocked(kyzonAxiosInstance.put);
const mockDelete = vi.mocked(kyzonAxiosInstance.delete);
const mockRefreshKyzonToken = vi.mocked(refreshKyzonToken);
const mockIsTokenExpired = vi.mocked(isTokenExpired);

const mockCredentialKey: KyzonCredentialKey = {
  access_token: "mock_access_token",
  refresh_token: "mock_refresh_token",
  token_type: "Bearer",
  scope: "meetings:write calendar:write profile:read",
  expiry_date: Date.now() + 3600000,
  user_id: "mock_user_id",
  team_id: "mock_team_id",
};

const testCredential: CredentialPayload = {
  appId: config.slug,
  id: 1,
  invalid: false,
  key: mockCredentialKey,
  type: config.type,
  userId: 1,
  user: { email: "test@example.com" },
  teamId: 1,
  delegationCredentialId: null,
};

const mockCalendarEvent: CalendarEvent = {
  type: "event",
  uid: "test-event-uid",
  title: "Test Meeting",
  description: "Test meeting description",
  startTime: "2024-01-15T10:00:00Z",
  endTime: "2024-01-15T11:00:00Z",
  organizer: {
    email: "organizer@example.com",
    name: "Test Organizer",
    timeZone: "America/New_York",
    language: {
      locale: "en",
      translate: vi.fn() as any,
    },
  },
  attendees: [
    {
      email: "attendee1@example.com",
      name: "Attendee 1",
      timeZone: "America/New_York",
      language: {
        locale: "en",
        translate: vi.fn() as any,
      },
    },
    {
      email: "attendee2@example.com",
      name: "Attendee 2",
      timeZone: "America/New_York",
      language: {
        locale: "en",
        translate: vi.fn() as any,
      },
    },
  ],
};

describe("KyzonVideoApiAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTokenExpired.mockReturnValue(false);
  });

  describe("createMeeting", () => {
    test("successfully creates meeting", async () => {
      const mockSpaceCallResponse = {
        id: "space_call_123",
        password: "meeting_password",
        url: "https://space.kyzon.com/call/123",
      };

      const mockCalendarEventResponse = {
        id: "calendar_event_456",
        meetingPassword: "calendar_password",
        meetingLink: "https://calendar.kyzon.com/meeting/456",
      };

      mockPost
        .mockResolvedValueOnce({ data: mockSpaceCallResponse })
        .mockResolvedValueOnce({ data: mockCalendarEventResponse });

      const videoApi = KyzonVideoApiAdapter(testCredential);
      expect(videoApi).toBeDefined();
      const result = await videoApi!.createMeeting(mockCalendarEvent);

      expect(mockPost).toHaveBeenCalledTimes(2);
      expect(mockPost).toHaveBeenNthCalledWith(
        1,
        `/v1/teams/${mockCredentialKey.team_id}/space/calls`,
        {
          name: mockCalendarEvent.title,
          isScheduled: true,
        },
        {
          headers: {
            Authorization: `Bearer ${mockCredentialKey.access_token}`,
          },
        }
      );

      expect(result).toEqual({
        type: config.type,
        id: mockCalendarEventResponse.id,
        password: mockCalendarEventResponse.meetingPassword,
        url: mockCalendarEventResponse.meetingLink,
      });
    });

    test("creates meeting with recurring event", async () => {
      const mockSpaceCallResponse = {
        id: "space_call_123",
        password: "meeting_password",
        url: "https://space.kyzon.com/call/123",
      };

      const mockCalendarEventResponse = {
        id: "calendar_event_456",
        meetingPassword: "calendar_password",
        meetingLink: "https://calendar.kyzon.com/meeting/456",
      };

      mockPost
        .mockResolvedValueOnce({ data: mockSpaceCallResponse })
        .mockResolvedValueOnce({ data: mockCalendarEventResponse });

      const recurringEvent = {
        ...mockCalendarEvent,
        recurringEvent: {
          freq: 2, // WEEKLY
          interval: 1,
          count: 5,
        },
      };

      const videoApi = KyzonVideoApiAdapter(testCredential);
      expect(videoApi).toBeDefined();
      const result = await videoApi!.createMeeting(recurringEvent);

      expect(mockPost).toHaveBeenNthCalledWith(
        2,
        `/v1/teams/${mockCredentialKey.team_id}/calendar-events`,
        expect.objectContaining({
          recurrence: {
            frequency: "WEEKLY",
            interval: 1,
            count: 5,
            untilDateUtcISOString: undefined,
          },
        }),
        expect.any(Object)
      );

      expect(result).toEqual({
        type: config.type,
        id: mockCalendarEventResponse.id,
        password: mockCalendarEventResponse.meetingPassword,
        url: mockCalendarEventResponse.meetingLink,
      });
    });

    test("handles space call creation failure", async () => {
      const mockError = new Error("Space call creation failed");
      mockPost.mockRejectedValueOnce(mockError);

      const videoApi = KyzonVideoApiAdapter(testCredential);
      expect(videoApi).toBeDefined();

      await expect(videoApi!.createMeeting(mockCalendarEvent)).rejects.toThrow(
        "Unable to create KYZON Space meeting. Please try again."
      );

      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    test("handles calendar event creation failure", async () => {
      const mockSpaceCallResponse = {
        id: "space_call_123",
        password: "meeting_password",
        url: "https://space.kyzon.com/call/123",
      };

      const mockError = new Error("Calendar event creation failed");
      mockPost.mockResolvedValueOnce({ data: mockSpaceCallResponse }).mockRejectedValueOnce(mockError);

      const videoApi = KyzonVideoApiAdapter(testCredential);

      await expect(videoApi?.createMeeting(mockCalendarEvent)).rejects.toThrow(
        "Unable to create KYZON Space meeting. Please try again."
      );

      expect(mockPost).toHaveBeenCalledTimes(2);
    });

    test("refreshes token on 401 error and retries", async () => {
      const refreshedToken = {
        ...mockCredentialKey,
        access_token: "new_access_token",
      };

      const axiosError = {
        isAxiosError: true,
        response: { status: 401 },
      };

      const mockSpaceCallResponse = {
        id: "space_call_123",
        password: "meeting_password",
        url: "https://space.kyzon.com/call/123",
      };

      mockRefreshKyzonToken.mockResolvedValueOnce(refreshedToken);
      mockPost
        .mockRejectedValueOnce(axiosError)
        .mockResolvedValueOnce({ data: mockSpaceCallResponse })
        .mockResolvedValueOnce({ data: { id: "calendar_456" } });

      vi.doMock("axios", () => ({
        isAxiosError: vi.fn(() => true),
      }));

      const videoApi = KyzonVideoApiAdapter(testCredential);
      expect(videoApi).toBeDefined();
      await videoApi!.createMeeting(mockCalendarEvent);

      expect(mockRefreshKyzonToken).toHaveBeenCalledWith(testCredential.id);
      expect(mockPost).toHaveBeenCalledTimes(3); // First failed call, then retry with new token, then calendar event
    });
  });

  describe("updateMeeting", () => {
    test("successfully updates existing meeting", async () => {
      const mockUpdatedResponse = {
        id: "calendar_event_456",
        meetingPassword: "updated_password",
        meetingLink: "https://updated.kyzon.com/meeting/456",
      };

      mockPut.mockResolvedValueOnce({ data: mockUpdatedResponse });

      const videoApi = KyzonVideoApiAdapter(testCredential);
      expect(videoApi).toBeDefined();
      const bookingRef = { meetingId: "existing_meeting_123" };
      const result = await videoApi!.updateMeeting(bookingRef, mockCalendarEvent);

      expect(mockPut).toHaveBeenCalledWith(
        `/v1/teams/${mockCredentialKey.team_id}/calendar-events/${bookingRef.meetingId}`,
        expect.objectContaining({
          title: mockCalendarEvent.title,
          description: mockCalendarEvent.description,
        }),
        {
          headers: {
            Authorization: `Bearer ${mockCredentialKey.access_token}`,
          },
        }
      );

      expect(result).toEqual({
        type: config.type,
        id: mockUpdatedResponse.id,
        password: mockUpdatedResponse.meetingPassword,
        url: mockUpdatedResponse.meetingLink,
      });
    });

    test("creates new meeting when no meetingId provided", async () => {
      const mockSpaceCallResponse = {
        id: "space_call_123",
        password: "meeting_password",
        url: "https://space.kyzon.com/call/123",
      };

      const mockCalendarEventResponse = {
        id: "calendar_event_456",
        meetingPassword: "calendar_password",
        meetingLink: "https://calendar.kyzon.com/meeting/456",
      };

      mockPost
        .mockResolvedValueOnce({ data: mockSpaceCallResponse })
        .mockResolvedValueOnce({ data: mockCalendarEventResponse });

      const videoApi = KyzonVideoApiAdapter(testCredential);
      expect(videoApi).toBeDefined();
      const bookingRef = {}; // No meetingId
      const result = await videoApi!.updateMeeting(bookingRef, mockCalendarEvent);

      expect(mockPost).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        type: config.type,
        id: mockCalendarEventResponse.id,
        password: mockCalendarEventResponse.meetingPassword,
        url: mockCalendarEventResponse.meetingLink,
      });
    });

    test("returns existing meeting data on update failure", async () => {
      const mockError = new Error("Update failed");
      mockPut.mockRejectedValueOnce(mockError);

      const videoApi = KyzonVideoApiAdapter(testCredential);
      expect(videoApi).toBeDefined();
      const bookingRef = {
        meetingId: "existing_meeting_123",
        meetingPassword: "existing_password",
        meetingUrl: "https://existing.kyzon.com/meeting/123",
      };
      const result = await videoApi!.updateMeeting(bookingRef, mockCalendarEvent);

      expect(result).toEqual({
        type: config.type,
        id: bookingRef.meetingId,
        password: bookingRef.meetingPassword,
        url: bookingRef.meetingUrl,
      });
    });
  });

  describe("deleteMeeting", () => {
    test("successfully deletes meeting", async () => {
      mockDelete.mockResolvedValueOnce({ status: 200 });

      const videoApi = KyzonVideoApiAdapter(testCredential);
      expect(videoApi).toBeDefined();
      await videoApi!.deleteMeeting("meeting_123");

      expect(mockDelete).toHaveBeenCalledWith(
        `/v1/teams/${mockCredentialKey.team_id}/calendar-events/meeting_123`,
        {
          headers: {
            Authorization: `Bearer ${mockCredentialKey.access_token}`,
          },
        }
      );
    });

    test("handles deletion failure gracefully", async () => {
      const mockError = new Error("Deletion failed");
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {
        // Mock implementation
      });
      mockDelete.mockRejectedValueOnce(mockError);

      const videoApi = KyzonVideoApiAdapter(testCredential);
      expect(videoApi).toBeDefined();

      // Should not throw error
      await expect(videoApi!.deleteMeeting("meeting_123")).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to delete KYZON calendar event meeting_123:",
        expect.objectContaining({
          message: "Deletion failed",
        })
      );

      consoleSpy.mockRestore();
    });
  });

  describe("getAvailability", () => {
    test("successfully retrieves availability", async () => {
      const mockSpaceCalls = [
        {
          eventTime: {
            startTimeUtcISOString: "2024-01-15T10:00:00Z",
            endTimeUtcISOString: "2024-01-15T11:00:00Z",
          },
        },
        {
          eventTime: {
            startTimeUtcISOString: "2024-01-15T14:00:00Z",
            endTimeUtcISOString: "2024-01-15T15:00:00Z",
          },
        },
      ];

      mockGet.mockResolvedValueOnce({ data: mockSpaceCalls });

      const videoApi = KyzonVideoApiAdapter(testCredential);
      expect(videoApi).toBeDefined();
      const result = await videoApi!.getAvailability("2024-01-15T00:00:00Z", "2024-01-16T00:00:00Z");

      expect(mockGet).toHaveBeenCalledWith(`/v1/teams/${mockCredentialKey.team_id}/space/calls`, {
        params: {
          startDateUtcISOString: "2024-01-15T00:00:00Z",
          endDateUtcISOString: "2024-01-16T00:00:00Z",
        },
        headers: {
          Authorization: `Bearer ${mockCredentialKey.access_token}`,
        },
      });

      expect(result).toEqual([
        {
          start: "2024-01-15T10:00:00Z",
          end: "2024-01-15T11:00:00Z",
          source: "KYZON Space",
        },
        {
          start: "2024-01-15T14:00:00Z",
          end: "2024-01-15T15:00:00Z",
          source: "KYZON Space",
        },
      ]);
    });

    test("filters out ongoing events without end time", async () => {
      const mockSpaceCalls = [
        {
          eventTime: {
            startTimeUtcISOString: "2024-01-15T10:00:00Z",
            endTimeUtcISOString: "2024-01-15T11:00:00Z",
          },
        },
        {
          eventTime: {
            startTimeUtcISOString: "2024-01-15T14:00:00Z",
            endTimeUtcISOString: null, // Ongoing event
          },
        },
      ];

      mockGet.mockResolvedValueOnce({ data: mockSpaceCalls });

      const videoApi = KyzonVideoApiAdapter(testCredential);
      expect(videoApi).toBeDefined();
      const result = await videoApi!.getAvailability("2024-01-15T00:00:00Z", "2024-01-16T00:00:00Z");

      // Should only include the event with end time
      expect(result).toEqual([
        {
          start: "2024-01-15T10:00:00Z",
          end: "2024-01-15T11:00:00Z",
          source: "KYZON Space",
        },
      ]);
    });

    test("returns empty array when no date range provided", async () => {
      const videoApi = KyzonVideoApiAdapter(testCredential);
      expect(videoApi).toBeDefined();

      const result1 = await videoApi!.getAvailability();
      const result2 = await videoApi!.getAvailability("2024-01-15T00:00:00Z");
      const result3 = await videoApi!.getAvailability(undefined, "2024-01-16T00:00:00Z");

      expect(result1).toEqual([]);
      expect(result2).toEqual([]);
      expect(result3).toEqual([]);
    });

    test("handles availability fetch failure gracefully", async () => {
      const mockError = new Error("Availability fetch failed");
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {
        // Mock implementation
      });
      mockGet.mockRejectedValueOnce(mockError);

      const videoApi = KyzonVideoApiAdapter(testCredential);
      expect(videoApi).toBeDefined();
      const result = await videoApi!.getAvailability("2024-01-15T00:00:00Z", "2024-01-16T00:00:00Z");

      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to get KYZON Space availability:",
        expect.objectContaining({
          message: "Availability fetch failed",
        })
      );

      consoleSpy.mockRestore();
    });
  });

  describe("token management integration", () => {
    test("refreshes expired token before making requests", async () => {
      const refreshedToken = {
        ...mockCredentialKey,
        access_token: "refreshed_access_token",
        expiry_date: Date.now() + 3600000,
      };

      mockIsTokenExpired.mockReturnValue(true);
      mockRefreshKyzonToken.mockResolvedValueOnce(refreshedToken);
      mockPost.mockResolvedValueOnce({ data: { id: "space_call_123" } });
      mockPost.mockResolvedValueOnce({ data: { id: "calendar_event_456" } });

      const videoApi = KyzonVideoApiAdapter(testCredential);
      expect(videoApi).toBeDefined();
      await videoApi!.createMeeting(mockCalendarEvent);

      expect(mockRefreshKyzonToken).toHaveBeenCalledWith(testCredential.id);
      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: {
            Authorization: `Bearer ${refreshedToken.access_token}`,
          },
        })
      );
    });

    test("uses current token when not expired", async () => {
      mockIsTokenExpired.mockReturnValue(false);
      mockPost.mockResolvedValueOnce({ data: { id: "space_call_123" } });
      mockPost.mockResolvedValueOnce({ data: { id: "calendar_event_456" } });

      const videoApi = KyzonVideoApiAdapter(testCredential);
      expect(videoApi).toBeDefined();
      await videoApi!.createMeeting(mockCalendarEvent);

      expect(mockRefreshKyzonToken).not.toHaveBeenCalled();
      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: {
            Authorization: `Bearer ${mockCredentialKey.access_token}`,
          },
        })
      );
    });
  });
});
