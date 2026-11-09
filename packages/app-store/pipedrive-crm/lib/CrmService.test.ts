import process from "node:process";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type { CredentialPayload } from "@calcom/types/Credential";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import BuildCrmService from "./CrmService";

const { requestMock }: { requestMock: Mock } = vi.hoisted(() => ({ requestMock: vi.fn() }));

vi.mock("../../_utils/oauth/OAuthManager", () => ({
  OAuthManager: vi.fn().mockImplementation(function () {
    return {
      getTokenObjectOrFetch: vi
        .fn()
        .mockResolvedValue({ token: { api_domain: "https://example.pipedrive.com" } }),
      request: requestMock,
    };
  }),
}));

const credential = {
  id: 1,
  type: "pipedrive-crm_crm",
  key: { access_token: "ACCESS_TOKEN", api_domain: "https://example.pipedrive.com" },
  userId: 1,
  user: { email: "organizer@example.com" },
  teamId: null,
  appId: "pipedrive-crm",
  invalid: false,
  delegatedToId: null,
  delegationCredentialId: null,
  encryptedKey: null,
} as unknown as CredentialPayload;

// 20:00 UTC is 01:30 the next day in Asia/Kolkata, so a local-time bug changes both the date and the time.
const event = {
  title: "Intro call",
  startTime: "2026-11-09T20:00:00.000Z",
  endTime: "2026-11-09T20:30:00.000Z",
  organizer: { language: { translate: (key: string) => key } },
  attendees: [{ email: "attendee@example.com", timeZone: "Asia/Kolkata" }],
  location: "",
  uid: "booking-uid",
} as unknown as CalendarEvent;

const getSentActivity = (): Record<string, unknown> => {
  const { options } = requestMock.mock.calls[0][0];
  return JSON.parse(options.body);
};

describe("PipedriveCrmService activity due date and time", () => {
  const originalTimeZone = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = "Asia/Kolkata";
    requestMock.mockReset();
    requestMock.mockResolvedValue({ json: { success: true, data: { id: 42 } } });
  });

  afterEach(() => {
    process.env.TZ = originalTimeZone;
  });

  test("sends the start time in UTC when creating an activity", async () => {
    const crmService = BuildCrmService(credential);

    await crmService.createEvent(event, [{ id: "7", email: "attendee@example.com" }]);

    expect(getSentActivity()).toMatchObject({ due_date: "2026-11-09", due_time: "20:00", duration: "0:30" });
  });

  test("sends the start time in UTC when updating an activity", async () => {
    const crmService = BuildCrmService(credential);

    await crmService.updateEvent("42", event);

    expect(requestMock.mock.calls[0][0].url).toBe("https://example.pipedrive.com/api/v1/activities/42");
    expect(getSentActivity()).toMatchObject({ due_date: "2026-11-09", due_time: "20:00" });
  });
});
