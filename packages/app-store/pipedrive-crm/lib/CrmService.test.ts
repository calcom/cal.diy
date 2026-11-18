import process from "node:process";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type { CredentialPayload } from "@calcom/types/Credential";
import type { Contact } from "@calcom/types/CrmService";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BuildCrmService from "./CrmService";

const { mockRequest } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
}));

vi.mock("../../_utils/oauth/OAuthManager", () => {
  class MockOAuthManager {
    getTokenObjectOrFetch = vi.fn().mockResolvedValue({
      token: { api_domain: "https://api.pipedrive.com" },
    });
    request = mockRequest;
  }
  return {
    OAuthManager: MockOAuthManager,
  };
});

vi.mock("../../_utils/oauth/getTokenObjectFromCredential", () => ({
  getTokenObjectFromCredential: vi.fn().mockReturnValue({
    access_token: "mock-token",
    api_domain: "https://api.pipedrive.com",
  }),
}));

vi.mock("./getPipedriveAppKeys", () => ({
  getPipedriveAppKeys: vi.fn().mockResolvedValue({
    client_id: "mock_client_id",
    client_secret: "mock_client_secret",
  }),
}));

const mockCredential: CredentialPayload = {
  id: 1,
  type: "pipedrive_crm",
  userId: 1,
  teamId: null,
  appId: "pipedrive-crm",
  key: {
    api_domain: "https://api.pipedrive.com",
  },
};

const mockEvent: CalendarEvent = {
  type: "meeting",
  title: "Test Meeting with John",
  startTime: "2026-11-09T20:00:00.000Z",
  endTime: "2026-11-09T20:30:00.000Z",
  organizer: {
    name: "Organizer",
    email: "organizer@example.com",
    timeZone: "UTC",
    language: {
      translate: (key: string) => key,
    },
  },
  attendees: [
    {
      name: "John Doe",
      email: "john@example.com",
      timeZone: "Europe/London",
      language: {
        translate: (key: string) => key,
      },
    },
  ],
  uid: "test-uid-123",
};

const mockContacts: Contact[] = [
  {
    id: "42",
    name: "John Doe",
    email: "john@example.com",
  },
];

describe("PipedriveCrmService", () => {
  const originalTZ = process.env.TZ;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.TZ = originalTZ;
  });

  it("should send activity due_time in UTC when creating an activity regardless of server timezone", async () => {
    process.env.TZ = "Asia/Kolkata";

    mockRequest.mockResolvedValueOnce({
      json: {
        success: true,
        data: {
          id: 101,
          subject: mockEvent.title,
          due_date: "2026-11-09",
          due_time: "20:00",
        },
      },
    });

    const service = BuildCrmService(mockCredential);
    const result = await service.createEvent(mockEvent, mockContacts);

    expect(result.id).toBe("101");
    expect(mockRequest).toHaveBeenCalledTimes(1);

    const callArgs = mockRequest.mock.calls[0][0];
    expect(callArgs.url).toBe("https://api.pipedrive.com/api/v1/activities");
    expect(callArgs.options.method).toBe("POST");

    const payload = JSON.parse(callArgs.options.body);
    expect(payload.due_date).toBe("2026-11-09");
    // Crucial check: due_time must be "20:00" (UTC), not local time ("01:30" in Asia/Kolkata)
    expect(payload.due_time).toBe("20:00");
  });

  it("should send activity due_time in UTC when updating an activity regardless of server timezone", async () => {
    process.env.TZ = "America/New_York";

    mockRequest.mockResolvedValueOnce({
      json: {
        success: true,
        data: {
          id: 202,
          subject: mockEvent.title,
          due_date: "2026-11-09",
          due_time: "20:00",
        },
      },
    });

    const service = BuildCrmService(mockCredential);
    const result = await service.updateEvent("202", mockEvent);

    expect(result.id).toBe("202");
    expect(mockRequest).toHaveBeenCalledTimes(1);

    const callArgs = mockRequest.mock.calls[0][0];
    expect(callArgs.url).toBe("https://api.pipedrive.com/api/v1/activities/202");
    expect(callArgs.options.method).toBe("PUT");

    const payload = JSON.parse(callArgs.options.body);
    expect(payload.due_date).toBe("2026-11-09");
    // Crucial check: due_time must be "20:00" (UTC), not local time ("15:00" in America/New_York)
    expect(payload.due_time).toBe("20:00");
  });

  it("should preserve correct UTC due_date and due_time across midnight boundaries", async () => {
    // 23:45 UTC is next day 05:15 in Asia/Kolkata
    process.env.TZ = "Asia/Kolkata";

    const midnightEvent: CalendarEvent = {
      ...mockEvent,
      startTime: "2026-11-09T23:45:00.000Z",
      endTime: "2026-11-10T00:15:00.000Z",
    };

    mockRequest.mockResolvedValueOnce({
      json: {
        success: true,
        data: {
          id: 303,
          subject: midnightEvent.title,
          due_date: "2026-11-09",
          due_time: "23:45",
        },
      },
    });

    const service = BuildCrmService(mockCredential);
    const result = await service.createEvent(midnightEvent, mockContacts);

    expect(result.id).toBe("303");
    const callArgs = mockRequest.mock.calls[0][0];
    const payload = JSON.parse(callArgs.options.body);

    expect(payload.due_date).toBe("2026-11-09");
    expect(payload.due_time).toBe("23:45");
  });
});
