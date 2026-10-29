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

const busyEvent = (
  subject: string,
  hour: number
): { showAs: string; subject: string; start: { dateTime: string }; end: { dateTime: string } } => ({
  showAs: "busy",
  subject,
  start: { dateTime: `2024-01-10T${String(hour).padStart(2, "0")}:00:00.0000000` },
  end: { dateTime: `2024-01-10T${String(hour).padStart(2, "0")}:30:00.0000000` },
});

const batchResponse = (
  responses: Array<{ id: string; status: number; body?: object; headers?: Record<string, string> }>
): void => {
  requestRawMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ responses }), { headers: { "content-encoding": "gzip" } })
  );
};

const getRequestedBatch = (call: number = 0): Array<{ id: string; url: string; method: string }> =>
  JSON.parse(requestRawMock.mock.calls[call][0].options.body).requests;

const mockCalendarView = (): void => {
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

const getRequestedUrl = (): string =>
  JSON.parse(requestRawMock.mock.calls[0][0].options.body).requests[0].url;

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

  test("rejects when a selected calendar returns a 503 batch subresponse", async () => {
    batchResponse([{ id: "0", status: 503, body: { error: { message: "Unavailable" } } }]);

    await expect(BuildCalendarService(credential).getAvailability(availabilityParams)).rejects.toThrow(
      "status 503"
    );
  });

  test("rejects instead of returning partial busy times when one of two calendars fails", async () => {
    batchResponse([
      { id: "0", status: 200, body: { value: [busyEvent("First calendar", 10)] } },
      { id: "1", status: 503, body: { error: { message: "Unavailable" } } },
    ]);

    await expect(
      BuildCalendarService(credential).getAvailability({
        ...availabilityParams,
        selectedCalendars: [
          ...availabilityParams.selectedCalendars,
          { integration: "office365_calendar", externalId: "second-calendar" },
        ],
      })
    ).rejects.toThrow("status 503");
  });

  test("preserves a successful result while retrying a throttled calendar", async () => {
    batchResponse([
      { id: "1", status: 429, headers: { "Retry-After": "0" }, body: {} },
      { id: "0", status: 200, body: { value: [busyEvent("First calendar", 10)] } },
    ]);
    batchResponse([{ id: "1", status: 200, body: { value: [busyEvent("Second calendar", 11)] } }]);

    const result = await BuildCalendarService(credential).getAvailability({
      ...availabilityParams,
      selectedCalendars: [
        ...availabilityParams.selectedCalendars,
        { integration: "office365_calendar", externalId: "second-calendar" },
      ],
    });

    expect(result).toEqual([
      { start: "2024-01-10T10:00:00.0000000Z", end: "2024-01-10T10:30:00.0000000Z", title: "First calendar" },
      {
        start: "2024-01-10T11:00:00.0000000Z",
        end: "2024-01-10T11:30:00.0000000Z",
        title: "Second calendar",
      },
    ]);
    expect(getRequestedBatch(1).map((request: { id: string }) => request.id)).toEqual(["1"]);
  });

  test("does not discard a non-429 failure in a batch that also contains a 429", async () => {
    batchResponse([
      { id: "0", status: 429, headers: { "Retry-After": "0" }, body: {} },
      { id: "1", status: 503, body: { error: { message: "Unavailable" } } },
    ]);
    batchResponse([{ id: "0", status: 200, body: { value: [busyEvent("Retried calendar", 10)] } }]);

    await expect(
      BuildCalendarService(credential).getAvailability({
        ...availabilityParams,
        selectedCalendars: [
          ...availabilityParams.selectedCalendars,
          { integration: "office365_calendar", externalId: "second-calendar" },
        ],
      })
    ).rejects.toThrow("status 503");
    expect(getRequestedBatch(1).map((request: { id: string }) => request.id)).toEqual(["0"]);
  });

  test("returns busy times when a throttled request succeeds on retry", async () => {
    batchResponse([{ id: "0", status: 429, headers: { "Retry-After": "0" }, body: {} }]);
    batchResponse([{ id: "0", status: 200, body: { value: [busyEvent("Retried event", 12)] } }]);

    await expect(BuildCalendarService(credential).getAvailability(availabilityParams)).resolves.toEqual([
      { start: "2024-01-10T12:00:00.0000000Z", end: "2024-01-10T12:30:00.0000000Z", title: "Retried event" },
    ]);
  });

  test("fails closed when a throttled request exhausts its retries", async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      batchResponse([{ id: "0", status: 429, headers: { "Retry-After": "0" }, body: {} }]);
    }

    await expect(BuildCalendarService(credential).getAvailability(availabilityParams)).rejects.toThrow(
      "status 429"
    );
    expect(requestRawMock).toHaveBeenCalledTimes(3);
  });

  test("rejects when an @odata.nextLink page fails", async () => {
    batchResponse([
      {
        id: "0",
        status: 200,
        body: {
          value: [busyEvent("First page", 10)],
          "@odata.nextLink": "https://graph.microsoft.com/v1.0/next",
        },
      },
    ]);
    batchResponse([{ id: "0", status: 503, body: { error: { message: "Unavailable" } } }]);

    await expect(BuildCalendarService(credential).getAvailability(availabilityParams)).rejects.toThrow(
      "status 503"
    );
  });

  test("combines events from successful paginated responses", async () => {
    batchResponse([
      {
        id: "0",
        status: 200,
        body: {
          value: [busyEvent("First page", 10)],
          "@odata.nextLink": "https://graph.microsoft.com/v1.0/next",
        },
      },
    ]);
    batchResponse([{ id: "0", status: 200, body: { value: [busyEvent("Second page", 11)] } }]);

    await expect(BuildCalendarService(credential).getAvailability(availabilityParams)).resolves.toEqual([
      { start: "2024-01-10T10:00:00.0000000Z", end: "2024-01-10T10:30:00.0000000Z", title: "First page" },
      { start: "2024-01-10T11:00:00.0000000Z", end: "2024-01-10T11:30:00.0000000Z", title: "Second page" },
    ]);
  });

  test("returns an empty array for a successfully retrieved empty calendar", async () => {
    batchResponse([{ id: "0", status: 200, body: { value: [] } }]);

    await expect(BuildCalendarService(credential).getAvailability(availabilityParams)).resolves.toEqual([]);
  });

  test.each([
    { name: "missing", responses: [] },
    { name: "unexpected", responses: [{ id: "99", status: 200, body: { value: [] } }] },
    {
      name: "duplicate",
      responses: [
        { id: "0", status: 200, body: { value: [] } },
        { id: "0", status: 200, body: { value: [] } },
      ],
    },
    { name: "malformed", responses: [{ id: "0", status: 200, body: {} }] },
    {
      name: "malformed event",
      responses: [
        { id: "0", status: 200, body: { value: [{ start: { dateTime: "2024-01-10T10:00:00Z" } }] } },
      ],
    },
  ])("rejects safely when the batch response is $name", async ({ responses }) => {
    batchResponse(responses);

    await expect(BuildCalendarService(credential).getAvailability(availabilityParams)).rejects.toThrow();
  });
});
