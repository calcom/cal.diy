import { vi } from "vitest";

const setCredentialsMock = vi.fn();
const freebusyQueryMock = vi.fn();
const calendarListMock = vi.fn();
const calendarsGetMock = vi.fn();
const eventsListMock = vi.fn();
const calendarMockImplementation = {
  channels: {
    stop: vi.fn().mockResolvedValue(undefined),
  },
  calendarList: {
    list: calendarListMock,
  },
  calendars: {
    get: calendarsGetMock,
  },
  events: {
    list: eventsListMock,
    watch: vi.fn().mockResolvedValue({
      data: {
        kind: "api#channel",
        id: "mock-channel-id",
        resourceId: "mock-resource-id",
        resourceUri: "mock-resource-uri",
        expiration: "1111111111",
      },
    }),
  },
  freebusy: {
    query: freebusyQueryMock,
  },
};

const calendarMock = {
  calendar_v3: {
    Calendar: vi.fn().mockImplementation(function() { return calendarMockImplementation; }),
  },
};
const adminMock = {
  admin_directory_v1: {
    Admin: vi.fn(),
  },
};
export interface MockJWT {
  type: "jwt";
  config: {
    email: string;
    key: string;
    scopes: string[];
    subject: string;
  };
  authorize: () => Promise<void>;
}

export type MockOAuth2Client = {
  type: "oauth2";
  args: [string, string, string];
  setCredentials: typeof setCredentialsMock;
  refreshToken: () => Promise<{
    res: {
      data: typeof MOCK_OAUTH2_TOKEN;
      status: number;
      statusText: string;
    };
  }>;
  isTokenExpiring: () => boolean;
};

export const MOCK_JWT_TOKEN = {
  access_token: "MOCK_ACCESS_TOKEN_JWT",
  refresh_token: "placeholder_refresh_token",
  scope: "https://www.googleapis.com/auth/calendar",
  token_type: "Bearer",
  expiry_date: 1625097600000,
};

export const MOCK_OAUTH2_TOKEN = {
  access_token: "MOCK_ACCESS_TOKEN_OAUTH2",
  refresh_token: "MOCK_REFRESH_TOKEN_OAUTH2",
  scope: "https://www.googleapis.com/auth/calendar",
  token_type: "Bearer",
  expiry_date: 1625097600000,
};

let lastCreatedJWT: MockJWT | null = null;
let lastCreatedOAuth2Client: MockOAuth2Client | null = null;

vi.mock("googleapis-common", async () => {
  const actual = await vi.importActual("googleapis-common");
  return {
    ...actual,
    OAuth2Client: vi.fn().mockImplementation(function(...args: [string, string, string]) {
      lastCreatedOAuth2Client = {
        type: "oauth2",
        args,
        setCredentials: setCredentialsMock,
        isTokenExpiring: vi.fn().mockReturnValue(true),
        refreshToken: vi.fn().mockResolvedValue({
          res: {
            data: MOCK_OAUTH2_TOKEN,
            status: 200,
            statusText: "OK",
          },
        }),
      };
      return lastCreatedOAuth2Client;
    }),
    JWT: vi.fn().mockImplementation(function(config: MockJWT["config"]) {
      lastCreatedJWT = {
        type: "jwt",
        config,
        authorize: vi.fn().mockResolvedValue(undefined),
      };
      return lastCreatedJWT;
    }),
  };
});
vi.mock("@googleapis/admin", () => adminMock);
vi.mock("@googleapis/calendar", () => calendarMock);
const getLastCreatedJWT = () => lastCreatedJWT;
const getLastCreatedOAuth2Client = () => lastCreatedOAuth2Client;
const setLastCreatedJWT = (jwt: MockJWT | null) => {
  lastCreatedJWT = jwt;
};
const setLastCreatedOAuth2Client = (oauth2Client: MockOAuth2Client | null) => {
  lastCreatedOAuth2Client = oauth2Client;
};
export {
  calendarMock,
  adminMock,
  setCredentialsMock,
  freebusyQueryMock,
  calendarListMock,
  eventsListMock,
  getLastCreatedJWT,
  getLastCreatedOAuth2Client,
  setLastCreatedJWT,
  setLastCreatedOAuth2Client,
};
