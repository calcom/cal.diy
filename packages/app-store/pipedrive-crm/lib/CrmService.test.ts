import type { CalendarEvent } from "@calcom/types/Calendar";
import type { CredentialPayload } from "@calcom/types/Credential";
import type { TFunction } from "i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@calcom/prisma", () => ({
  default: {
    credential: {
      update: vi.fn(),
    },
  },
}));

vi.mock("@calcom/prisma/client", () => ({
  Prisma: {},
}));

vi.mock("@calcom/lib/CalEventParser", () => ({
  getLocation: vi.fn((event: { location?: string }) => event?.location ?? ""),
}));

vi.mock("../../_utils/invalidateCredential", () => ({
  invalidateCredential: vi.fn(),
}));

vi.mock("../../_utils/oauth/markTokenAsExpired", () => ({
  markTokenAsExpired: vi.fn(),
}));

vi.mock("../../_utils/oauth/updateTokenObject", () => ({
  updateTokenObjectInDb: vi.fn(),
}));

vi.mock("./getPipedriveAppKeys", () => ({
  getPipedriveAppKeys: vi.fn().mockResolvedValue({
    client_id: "mock_client_id",
    client_secret: "mock_client_secret",
  }),
}));

import process from "node:process";
import BuildCrmService from "./CrmService";

function createMockCredential(): CredentialPayload {
  return {
    id: 1,
    type: "pipedrive-crm_crm",
    key: {
      access_token: "mock_access_token",
      refresh_token: "mock_refresh_token",
      token_type: "Bearer",
      expiry_date: Date.now() + 3_600_000,
      api_domain: "https://api.pipedrive.com",
    },
    userId: 1,
    appId: "pipedrive-crm",
    teamId: null,
    invalid: false,
    user: {
      email: "organizer@example.com",
    },
    delegationCredentialId: null,
    encryptedKey: null,
  };
}

function createMockEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    type: "pipedrive-test-event",
    title: "Pipedrive Sync Meeting",
    startTime: "2026-11-09T20:00:00.000Z",
    endTime: "2026-11-09T20:30:00.000Z",
    uid: "booking-uid-123",
    location: "https://cal.com/video/booking-uid-123",
    additionalNotes: "Discuss onboarding",
    organizer: {
      email: "organizer@example.com",
      name: "Organizer",
      timeZone: "UTC",
      language: {
        translate: ((key: string) => key) as TFunction,
        locale: "en",
      },
    },
    attendees: [
      {
        email: "attendee@example.com",
        name: "Attendee",
        timeZone: "Asia/Kolkata",
        language: {
          translate: ((key: string) => key) as TFunction,
          locale: "en",
        },
      },
    ],
    ...overrides,
  };
}

describe("PipedriveCrmService", () => {
  const originalTz = process.env.TZ;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            id: 42,
            subject: "Pipedrive Sync Meeting",
            due_date: "2026-11-09",
            due_time: "20:00",
            duration: "0:30",
            note: "",
            location: "",
            person_id: 7,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
  });

  afterEach(() => {
    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("sends due_date and due_time in UTC on createEvent regardless of server TZ", async () => {
    process.env.TZ = "Asia/Kolkata";
    const service = BuildCrmService(createMockCredential());

    await service.createEvent(createMockEvent(), [
      {
        id: "7",
        email: "attendee@example.com",
      },
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.pipedrive.com/api/v1/activities");
    const payload = JSON.parse(String(init?.body));
    expect(payload.type).toBe("meeting");
    expect(payload.person_id).toBe(7);
    expect(payload.due_date).toBe("2026-11-09");
    expect(payload.due_time).toBe("20:00");
    expect(payload.duration).toBe("0:30");
  });

  it("keeps UTC due_date and due_time consistent across local midnight boundaries", async () => {
    process.env.TZ = "Asia/Kolkata";
    const service = BuildCrmService(createMockCredential());

    await service.createEvent(
      createMockEvent({
        startTime: "2026-11-09T23:45:00.000Z",
        endTime: "2026-11-10T00:15:00.000Z",
      }),
      [
        {
          id: "7",
          email: "attendee@example.com",
        },
      ]
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0];
    const payload = JSON.parse(String(init?.body));
    expect(payload.due_date).toBe("2026-11-09");
    expect(payload.due_time).toBe("23:45");
    expect(payload.duration).toBe("0:30");
  });

  it("sends due_date and due_time in UTC on updateEvent regardless of server TZ", async () => {
    process.env.TZ = "America/Los_Angeles";
    const service = BuildCrmService(createMockCredential());

    await service.updateEvent(
      "42",
      createMockEvent({
        startTime: "2026-11-10T01:30:00+05:30",
        endTime: "2026-11-10T02:15:00+05:30",
      })
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.pipedrive.com/api/v1/activities/42");
    const payload = JSON.parse(String(init?.body));
    expect(payload.due_date).toBe("2026-11-09");
    expect(payload.due_time).toBe("20:00");
    expect(payload.duration).toBe("0:45");
  });
});
