import type { CredentialForCalendarServiceWithTenantId } from "@calcom/types/Credential";
import { beforeEach, describe, expect, test, vi } from "vitest";
import BuildCalendarService from "../CalendarService";

const { requestRawMock } = vi.hoisted(() => ({ requestRawMock: vi.fn() }));

vi.mock("../../../_utils/oauth/OAuthManager", () => ({
  OAuthManager: vi.fn().mockImplementation(function () {
    return { requestRaw: requestRawMock };
  }),
}));
vi.mock("../../../_utils/oauth/oAuthManagerHelper", () => ({
  oAuthManagerHelper: { credentialSyncVariables: {} },
}));
vi.mock("../getOfficeAppKeys", () => ({ getOfficeAppKeys: vi.fn() }));
vi.mock("@calcom/features/webhooks/lib/triggerDelegationCredentialErrorWebhook", () => ({
  triggerDelegationCredentialErrorWebhook: vi.fn(),
}));

const credential: CredentialForCalendarServiceWithTenantId = {
  id: 1,
  userId: 1,
  appId: "office365-calendar",
  type: "office365_calendar",
  key: { access_token: "access_token", refresh_token: "refresh_token", expires_in: Date.now() + 86400 },
  user: { email: "user@example.com" },
  delegationCredentialId: null,
  delegatedTo: null,
  invalid: false,
  teamId: null,
  encryptedKey: null,
};

const availabilityParams = {
  dateFrom: "2024-01-10T00:00:00Z",
  dateTo: "2024-01-11T00:00:00Z",
  selectedCalendars: [{ integration: "office365_calendar", externalId: "calendar-id" }],
  mode: "overlay" as const,
};

const mockCalendarView = () => {
  requestRawMock.mockResolvedValueOnce(
    // The batch response is only parsed when it comes back gzip encoded, which is what Microsoft Graph sends
    new Response(
      JSON.stringify({
        responses: [
          {
            id: "0",
            status: 200,
            body: {
              value: [
                {
                  showAs: "busy",
                  subject: "Standup",
                  start: { dateTime: "2024-01-10T10:00:00.0000000" },
                  end: { dateTime: "2024-01-10T10:30:00.0000000" },
                },
                {
                  showAs: "free",
                  subject: "Marked as free",
                  start: { dateTime: "2024-01-10T11:00:00.0000000" },
                  end: { dateTime: "2024-01-10T12:00:00.0000000" },
                },
                {
                  showAs: "tentative",
                  start: { dateTime: "2024-01-10T13:00:00.0000000" },
                  end: { dateTime: "2024-01-10T14:00:00.0000000" },
                },
              ],
            },
          },
        ],
      }),
      { headers: { "content-encoding": "gzip" } }
    )
  );
};

const getRequestedUrl = () => JSON.parse(requestRawMock.mock.calls[0][0].options.body).requests[0].url;

describe("Office365CalendarService", () => {
  beforeEach(() => {
    requestRawMock.mockReset();
  });

  test("getAvailabilityWithTitles returns the busy events with their titles", async () => {
    mockCalendarView();

    const result = await BuildCalendarService(credential).getAvailabilityWithTitles?.(availabilityParams);

    expect(result).toEqual([
      { start: "2024-01-10T10:00:00.0000000Z", end: "2024-01-10T10:30:00.0000000Z", title: "Standup" },
      { start: "2024-01-10T13:00:00.0000000Z", end: "2024-01-10T14:00:00.0000000Z" },
    ]);
    expect(getRequestedUrl()).toContain("/me/calendars/calendar-id/calendarView");
    expect(getRequestedUrl()).toContain("$select=showAs,start,end,subject&");
  });

  test("getAvailability doesn't ask Microsoft for the titles", async () => {
    mockCalendarView();

    await BuildCalendarService(credential).getAvailability(availabilityParams);

    expect(getRequestedUrl()).toContain("$select=showAs,start,end&");
  });
});
