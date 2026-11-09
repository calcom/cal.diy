import prismaMock from "@calcom/testing/lib/__mocks__/prismaMock";

import type { CalendarEvent } from "@calcom/types/Calendar";
import type { CredentialPayload } from "@calcom/types/Credential";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import BasecampCalendarService from "./CalendarService";

vi.mock("../../_utils/getAppKeysFromSlug", () => ({
  default: vi.fn().mockResolvedValue({ user_agent: "Cal.diy test" }),
}));

const credential = {
  id: 1,
  type: "basecamp3_calendar",
  key: {
    access_token: "ACCESS_TOKEN",
    expires_at: Date.now() + 60 * 60 * 1000,
    scheduleId: 3,
    projectId: 2,
    account: { id: 1, name: "Test account" },
  },
  userId: 1,
  user: { email: "organizer@example.com" },
  teamId: null,
  appId: "basecamp3",
  invalid: false,
  delegatedToId: null,
  delegationCredentialId: null,
  encryptedKey: null,
} as unknown as CredentialPayload;

const buildEvent = (): CalendarEvent =>
  ({
    title: "Intro call",
    uid: "booking-uid",
    // 03:30 UTC on Nov 10 is 10:30 PM on Nov 9 in New York.
    startTime: "2026-11-10T03:30:00.000Z",
    endTime: "2026-11-10T04:00:00.000Z",
    organizer: {
      id: 1,
      name: "Organizer",
      email: "organizer@example.com",
      timeZone: "America/New_York",
      language: { locale: "en" },
    },
    attendees: [],
    type: "intro-call",
  }) as unknown as CalendarEvent;

describe("BasecampCalendarService", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 42 }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("createEvent describes the time in the organizer's timezone", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ timeZone: "America/New_York" } as never);

    const service = new BasecampCalendarService(credential);
    await service.createEvent(buildEvent());

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.description).toContain(
      "Date and time: Mon, Nov 9, 2026, 10:30 PM - 11:00 PM America/New_York"
    );
    expect(body.starts_at).toBe("2026-11-10T03:30:00.000Z");
  });

  test("falls back to the organizer's timezone on the event when the user has none stored", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const service = new BasecampCalendarService(credential);
    await service.createEvent(buildEvent());

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.description).toContain(
      "Date and time: Mon, Nov 9, 2026, 10:30 PM - 11:00 PM America/New_York"
    );
  });
});
