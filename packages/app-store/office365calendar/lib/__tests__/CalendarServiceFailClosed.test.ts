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

  // A subrequest that fails with a status other than 429 is not a calendar with no events. If
  // getAvailability resolves anyway, getBusyCalendarTimes reports success and never adds its
  // error-placeholder, so the failed calendar looks free and a slot over its events can be booked.
  const mockBatch = (responses: unknown[]) =>
    requestRawMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ responses }), { headers: { "content-encoding": "gzip" } })
    );
  const failedSubrequest = (id: string, status: number) => ({
    id,
    status,
    body: { error: { code: "ServiceNotAvailable", message: "The service is temporarily unavailable." } },
  });

  test("getAvailability does not drop a calendar whose batch subrequest failed with a 503", async () => {
    mockBatch([
      {
        id: "0",
        status: 200,
        body: {
          value: [
            {
              showAs: "busy",
              start: { dateTime: "2024-01-10T10:00:00.0000000" },
              end: { dateTime: "2024-01-10T10:30:00.0000000" },
            },
          ],
        },
      },
      failedSubrequest("1", 503),
    ]);

    const result = BuildCalendarService(credential).getAvailability({
      ...availabilityParams,
      selectedCalendars: [
        { integration: "office365_calendar", externalId: "calendar-a" },
        { integration: "office365_calendar", externalId: "calendar-b" },
      ],
    });

    // Fail closed: reject, so the caller blocks the range, instead of returning calendar-a's events only.
    await expect(result).rejects.toBeDefined();
  });

  test("getAvailability does not report a free day when the only calendar's subrequest failed", async () => {
    mockBatch([failedSubrequest("0", 503)]);

    const result = BuildCalendarService(credential).getAvailability(availabilityParams);

    await expect(result).rejects.toBeDefined();
  });

  test("getAvailability rejects when a calendarView nextLink page fails", async () => {
    mockBatch([
      {
        id: "0",
        status: 200,
        body: {
          "@odata.nextLink":
            "https://graph.microsoft.com/v1.0/me/calendars/calendar-id/calendarView?$skiptoken=page2",
          value: [
            {
              showAs: "busy",
              start: { dateTime: "2024-01-10T10:00:00.0000000" },
              end: { dateTime: "2024-01-10T10:30:00.0000000" },
            },
          ],
        },
      },
    ]);
    mockBatch([failedSubrequest("0", 503)]);

    const result = BuildCalendarService(credential).getAvailability(availabilityParams);

    await expect(result).rejects.toBeDefined();
  });
});
