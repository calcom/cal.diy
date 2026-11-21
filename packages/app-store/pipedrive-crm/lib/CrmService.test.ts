import type { CalendarEvent } from "@calcom/types/Calendar";
import type { CredentialPayload } from "@calcom/types/Credential";
import type { Contact } from "@calcom/types/CrmService";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequest = vi.fn();

vi.mock("@calcom/lib/logger", () => ({
  default: {
    getSubLogger: () => ({
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    }),
  },
}));

vi.mock("../../_utils/oauth/OAuthManager", () => ({
  OAuthManager: vi.fn().mockImplementation(() => ({
    getTokenObjectOrFetch: vi.fn().mockResolvedValue({ token: { api_domain: "https://api.pipedrive.com" } }),
    request: mockRequest,
  })),
}));

vi.mock("../../_utils/invalidateCredential", () => ({
  invalidateCredential: vi.fn(),
}));

vi.mock("../../_utils/oauth/getTokenObjectFromCredential", () => ({
  getTokenObjectFromCredential: vi.fn(),
}));

vi.mock("../../_utils/oauth/markTokenAsExpired", () => ({
  markTokenAsExpired: vi.fn(),
}));

vi.mock("../../_utils/oauth/updateTokenObject", () => ({
  updateTokenObjectInDb: vi.fn(),
}));

import BuildCrmService from "./CrmService";

describe("PipedriveCrmService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockCredential: CredentialPayload = {
    id: 1,
    appId: "pipedrive-crm",
    type: "pipedrive_crm",
    userId: 1,
    key: { access_token: "test-token" },
  };

  const mockEvent: CalendarEvent = {
    title: "Quarterly Review",
    startTime: "2026-11-09T20:00:00.000Z",
    endTime: "2026-11-09T20:30:00.000Z",
    organizer: {
      id: 1,
      name: "Alice Host",
      email: "alice@example.com",
      timeZone: "UTC",
      language: { translate: (key: string) => key } as any,
    },
    attendees: [
      {
        id: 2,
        name: "Bob Invitee",
        email: "bob@example.com",
        timeZone: "America/New_York",
        language: { translate: (key: string) => key } as any,
      },
    ],
    uid: "booking-uid-123",
    type: "30min",
  };

  const mockContacts: Contact[] = [
    {
      id: "42",
      name: "Bob Invitee",
      email: "bob@example.com",
    },
  ];

  it("sends activity due_date and due_time in UTC when creating an event", async () => {
    mockRequest.mockResolvedValueOnce({
      json: {
        success: true,
        data: { id: 101 },
      },
    });

    const service = BuildCrmService(mockCredential);
    const result = await service.createEvent(mockEvent, mockContacts);

    expect(result.id).toBe("101");
    expect(mockRequest).toHaveBeenCalledTimes(1);

    const callArgs = mockRequest.mock.calls[0][0];
    expect(callArgs.url).toBe("https://api.pipedrive.com/api/v1/activities");

    const payload = JSON.parse(callArgs.options.body);
    expect(payload.due_date).toBe("2026-11-09");
    expect(payload.due_time).toBe("20:00");
    expect(payload.duration).toBe("0:30");
  });

  it("sends activity due_date and due_time in UTC when updating an event", async () => {
    mockRequest.mockResolvedValueOnce({
      json: {
        success: true,
        data: { id: 101 },
      },
    });

    const service = BuildCrmService(mockCredential);
    const result = await service.updateEvent("101", mockEvent);

    expect(result.id).toBe("101");
    expect(mockRequest).toHaveBeenCalledTimes(1);

    const callArgs = mockRequest.mock.calls[0][0];
    expect(callArgs.url).toBe("https://api.pipedrive.com/api/v1/activities/101");

    const payload = JSON.parse(callArgs.options.body);
    expect(payload.due_date).toBe("2026-11-09");
    expect(payload.due_time).toBe("20:00");
  });
});
