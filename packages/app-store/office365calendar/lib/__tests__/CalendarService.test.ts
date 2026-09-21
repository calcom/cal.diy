import type { IntegrationCalendar } from "@calcom/types/Calendar";
import type { CredentialForCalendarServiceWithTenantId } from "@calcom/types/Credential";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { generateJsonResponse } from "../../../_utils/testUtils";
import BuildCalendarService from "../CalendarService";

const mockRequestRaw = vi.fn();

vi.mock("../../../_utils/oauth/OAuthManager", () => ({
  OAuthManager: vi.fn().mockImplementation(function () {
    return { requestRaw: mockRequestRaw };
  }),
}));

type SettledResponse = {
  id: string;
  status: number;
  headers: {
    "Retry-After": string;
    "Content-Type": string;
  };
  body: Record<string, unknown>;
};

const createSuccessResponse = (id: number): SettledResponse => ({
  id: String(id),
  status: 200,
  headers: {
    "Retry-After": "0",
    "Content-Type": "application/json",
  },
  body: {
    value: [
      {
        showAs: "busy",
        start: { dateTime: `2024-01-01T00:${String(id).padStart(2, "0")}:00` },
        end: { dateTime: `2024-01-01T01:${String(id).padStart(2, "0")}:00` },
      },
    ],
  },
});

const createRetryResponse = (id: number): SettledResponse => ({
  id: String(id),
  status: 429,
  headers: {
    "Retry-After": "0",
    "Content-Type": "application/json",
  },
  body: {},
});

const createBatchResponse = (responses: SettledResponse[]) => generateJsonResponse({ json: { responses } });

const testCredential: CredentialForCalendarServiceWithTenantId = {
  id: 1,
  appId: "office365_calendar",
  type: "office365_calendar",
  userId: 1,
  user: { email: "user@example.com" },
  teamId: null,
  key: {
    access_token: "FAKE_ACCESS_TOKEN",
    refresh_token: "FAKE_REFRESH_TOKEN",
  },
  encryptedKey: null,
  invalid: false,
  delegationCredentialId: null,
  delegatedTo: null,
};

describe("Office365CalendarService.getAvailability", () => {
  beforeEach(() => {
    mockRequestRaw.mockReset();
    vi.useRealTimers();
  });

  test("chunks batch requests and retries within chunk id space", async () => {
    const calendarService = BuildCalendarService(testCredential);
    const selectedCalendars: IntegrationCalendar[] = Array.from({ length: 25 }, (_, index) => ({
      integration: "office365_calendar",
      externalId: `calendar-${index}`,
    }));

    const batchRequestIds: number[][] = [];
    let callCount = 0;

    mockRequestRaw.mockImplementation(({ url, options }: { url: string; options?: RequestInit }) => {
      if (!url.endsWith("/$batch") || !options?.body) {
        throw new Error(`Unexpected request: ${url}`);
      }

      const { requests } = JSON.parse(String(options.body)) as {
        requests: { id: number }[];
      };

      batchRequestIds.push(requests.map((request) => request.id));
      callCount += 1;

      if (callCount === 1) {
        return createBatchResponse(requests.map((request) => createSuccessResponse(request.id)));
      }

      if (callCount === 2) {
        return createBatchResponse(
          requests.map((request) =>
            request.id === 2 ? createRetryResponse(request.id) : createSuccessResponse(request.id)
          )
        );
      }

      if (callCount === 3) {
        return createBatchResponse(requests.map((request) => createSuccessResponse(request.id)));
      }

      throw new Error(`Unexpected batch call count: ${callCount}`);
    });

    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const availabilityPromise = calendarService.getAvailability({
      dateFrom: "2024-01-01T00:00:00.000Z",
      dateTo: "2024-01-02T00:00:00.000Z",
      selectedCalendars,
      mode: "slots",
    });

    await vi.runAllTimersAsync();
    const availability = await availabilityPromise;

    expect(mockRequestRaw).toHaveBeenCalledTimes(3);
    expect(batchRequestIds[0]).toEqual([...Array(20).keys()]);
    expect(batchRequestIds[1]).toEqual([0, 1, 2, 3, 4]);
    expect(batchRequestIds[2]).toEqual([2]);
    expect(availability).toHaveLength(25);
  });
});
