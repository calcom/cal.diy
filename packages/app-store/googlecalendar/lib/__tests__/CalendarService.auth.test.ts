import prismock from "@calcom/testing/lib/__mocks__/prisma";
import "../__mocks__/features.repository";
import "../__mocks__/getGoogleAppKeys";
import {
  setCredentialsMock,
  calendarListMock,
  getLastCreatedJWT,
  getLastCreatedOAuth2Client,
  setLastCreatedJWT,
  setLastCreatedOAuth2Client,
  calendarMock,
  adminMock,
  MOCK_JWT_TOKEN,
  MOCK_OAUTH2_TOKEN,
} from "../__mocks__/googleapis";

import { expect, test, beforeEach, vi, describe } from "vitest";
import "vitest-fetch-mock";

import type { CredentialForCalendarServiceWithEmail } from "@calcom/types/Credential";

import BuildCalendarService from "../CalendarService";
import { shouldRetryGoogleCalendarRequest } from "../retryConfig";
import {
  createMockJWTInstance,
  createInMemoryDelegationCredentialForCalendarService as createInMemoryDelegationCredentialForBuildCalendarService,
  defaultDelegatedCredential,
  createCredentialForCalendarService,
} from "./utils";

function expectJWTInstanceToBeCreated() {
  expect(getLastCreatedJWT()).toBeDefined();
  expect(setCredentialsMock).not.toHaveBeenCalled();
}

function expectOAuth2InstanceToBeCreated() {
  expect(setCredentialsMock).toHaveBeenCalled();
  expect(getLastCreatedJWT()).toBeNull();
}

function mockSuccessfulCalendarListFetch() {
  calendarListMock.mockImplementation(() => {
    return {
      data: { items: [] },
    };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setCredentialsMock.mockClear();
  calendarMock.calendar_v3.Calendar.mockClear();
  adminMock.admin_directory_v1.Admin.mockClear();

  setLastCreatedJWT(null);
  setLastCreatedOAuth2Client(null);
  createMockJWTInstance({});
});

async function expectNoCredentialsInDb() {
  const credentials = await prismock.credential.findMany({});
  expect(credentials).toHaveLength(0);
}

async function expectCredentialsInDb(credentials: CredentialForCalendarServiceWithEmail[]) {
  const credentialsInDb = await prismock.credential.findMany({});
  expect(credentialsInDb.length).toBe(credentials.length);
  expect(credentialsInDb).toEqual(expect.arrayContaining(credentials));
}

describe("GoogleCalendarService credential handling", () => {
  describe("Delegation Credential", () => {
    test("uses JWT auth with impersonation when listCalendars is called and creates a new credential in DB with the key as JWT token if it doesn't exist", async () => {
      const credentialWithDelegation = await createInMemoryDelegationCredentialForBuildCalendarService({
        user: { email: "user@example.com" },
        delegatedTo: defaultDelegatedCredential,
        delegationCredentialId: "delegation-credential-id-1",
      });

      mockSuccessfulCalendarListFetch();
      expectNoCredentialsInDb();
      const calendarService = BuildCalendarService(credentialWithDelegation);
      await calendarService.listCalendars();
      expectJWTInstanceToBeCreated();
      await expectCredentialsInDb([
        expect.objectContaining({
          delegationCredentialId: credentialWithDelegation.delegationCredentialId,
          key: MOCK_JWT_TOKEN,
          userId: credentialWithDelegation.userId,
        }),
      ]);
    });

    test("uses JWT auth with impersonation when listCalendars is called and updates the credential in DB with the new JWT token if it exists", async () => {
      const credentialWithDelegation = await createInMemoryDelegationCredentialForBuildCalendarService({
        user: { email: "user@example.com" },
        delegatedTo: defaultDelegatedCredential,
        delegationCredentialId: "delegation-credential-id-1",
      });

      mockSuccessfulCalendarListFetch();
      const existingCredential = await prismock.credential.create({
        data: {
          type: "google_calendar",
          delegationCredentialId: credentialWithDelegation.delegationCredentialId,
          userId: credentialWithDelegation.userId,
          key: {
            access_token: "CURRENT_ACCESS_TOKEN",
          },
        },
      });
      const calendarService = BuildCalendarService(credentialWithDelegation);
      await calendarService.listCalendars();
      expectJWTInstanceToBeCreated();
      await expectCredentialsInDb([
        expect.objectContaining({
          id: existingCredential.id,
          delegationCredentialId: credentialWithDelegation.delegationCredentialId,
          key: MOCK_JWT_TOKEN,
          userId: credentialWithDelegation.userId,
        }),
      ]);
    });

    test("JWT token is reused when not expired when listCalendars is called again on a new instance of CalendarService", async () => {
      const jwtTokenThatHasNotExpired = {
        ...MOCK_JWT_TOKEN,
        expiry_date: Date.now() + 1000 * 60 * 60 * 24,
      };
      createMockJWTInstance({
        tokenExpiryDate: jwtTokenThatHasNotExpired.expiry_date,
      });
      const credentialWithDelegation = await createInMemoryDelegationCredentialForBuildCalendarService({
        user: { email: "user@example.com" },
        delegatedTo: defaultDelegatedCredential,
        delegationCredentialId: "delegation-credential-id-1",
      });

      console.log("TESTS: credentialWithDelegation", credentialWithDelegation);

      mockSuccessfulCalendarListFetch();
      await expectNoCredentialsInDb();
      console.log("TESTS: First instance of CalendarService");
      const calendarService1 = BuildCalendarService({
        ...credentialWithDelegation,
      });
      await calendarService1.listCalendars();
      await expectCredentialsInDb([
        expect.objectContaining({
          delegationCredentialId: credentialWithDelegation.delegationCredentialId,
          key: jwtTokenThatHasNotExpired,
          userId: credentialWithDelegation.userId,
        }),
      ]);

      const existingCredential = await prismock.credential.findFirst({
        where: {
          delegationCredentialId: credentialWithDelegation.delegationCredentialId,
          userId: credentialWithDelegation.userId,
        },
      });
      expect(existingCredential).toBeDefined();
      console.log("TESTS: Second instance of CalendarService");
      createMockJWTInstance({
        authorizeError: {
          response: {
            data: {
              error: "I_WOULD_ERROR_IF_YOU_USE_ME",
            },
          },
        },
      });
      const calendarService2 = BuildCalendarService({
        ...credentialWithDelegation,
      });
      await calendarService2.listCalendars();
      await expectCredentialsInDb([
        expect.objectContaining({
          // Same credential should be reused
          id: existingCredential?.id,
          delegationCredentialId: credentialWithDelegation.delegationCredentialId,
          key: jwtTokenThatHasNotExpired,
        }),
      ]);
    });
  });

  describe("Non-Delegation Credential", () => {
    test("uses OAuth2 auth when listCalendars is called", async () => {
      const regularCredential = await createCredentialForCalendarService();
      mockSuccessfulCalendarListFetch();
      const calendarService = BuildCalendarService(regularCredential);
      await calendarService.listCalendars();

      expectOAuth2InstanceToBeCreated();

      expect(calendarMock.calendar_v3.Calendar).toHaveBeenCalledWith({
        auth: getLastCreatedOAuth2Client(),
        retryConfig: expect.objectContaining({ retry: 3, shouldRetry: shouldRetryGoogleCalendarRequest }),
      });
      await expectCredentialsInDb([
        expect.objectContaining({
          id: regularCredential.id,
          key: MOCK_OAUTH2_TOKEN,
        }),
      ]);
    });
  });

  describe("Delegation Credential Error handling", () => {
    test("handles clientId not added to Google Workspace Admin Console error", async () => {
      const credentialWithDelegation = await createInMemoryDelegationCredentialForBuildCalendarService({
        user: { email: "user@example.com" },
        delegatedTo: defaultDelegatedCredential,
        delegationCredentialId: "delegation-credential-id-1",
      });

      createMockJWTInstance({
        authorizeError: {
          response: {
            data: {
              error: "unauthorized_client",
            },
          },
        },
      });

      const calendarService = BuildCalendarService(credentialWithDelegation);

      await expect(calendarService.listCalendars()).rejects.toThrow(
        "Make sure that the Client ID for the delegation credential is added to the Google Workspace Admin Console"
      );
    });

    test("handles DelegationCredential authorization errors appropriately", async () => {
      const credentialWithDelegation = await createInMemoryDelegationCredentialForBuildCalendarService({
        user: { email: "user@example.com" },
        delegatedTo: defaultDelegatedCredential,
        delegationCredentialId: "delegation-credential-id-1",
      });

      createMockJWTInstance({
        authorizeError: {
          response: {
            data: {
              error: "unauthorized_client",
            },
          },
        },
      });

      const calendarService = BuildCalendarService(credentialWithDelegation);

      await expect(calendarService.listCalendars()).rejects.toThrow(
        "Make sure that the Client ID for the delegation credential is added to the Google Workspace Admin Console"
      );
    });

    test("handles invalid_grant error (user not in workspace) appropriately", async () => {
      const credentialWithDelegation = await createInMemoryDelegationCredentialForBuildCalendarService({
        user: { email: "user@example.com" },
        delegatedTo: defaultDelegatedCredential,
        delegationCredentialId: "delegation-credential-id-1",
      });

      createMockJWTInstance({
        authorizeError: {
          response: {
            data: {
              error: "invalid_grant",
            },
          },
        },
      });

      const calendarService = BuildCalendarService(credentialWithDelegation);

      await expect(calendarService.listCalendars()).rejects.toThrow(
        `User ${credentialWithDelegation.user?.email} might not exist in Google Workspace`
      );
    });

    test("handles DelegationCredential authorization errors appropriately", async () => {
      const credentialWithDelegation = await createInMemoryDelegationCredentialForBuildCalendarService({
        user: { email: "user@example.com" },
        delegatedTo: defaultDelegatedCredential,
        delegationCredentialId: "delegation-credential-id-1",
      });

      createMockJWTInstance({
        authorizeError: new Error("Some unexpected error"),
      });

      const calendarService = BuildCalendarService(credentialWithDelegation);

      await expect(calendarService.listCalendars()).rejects.toThrow(
        "Error authorizing delegation credential"
      );
    });

    test("On missing user email for DelegationCredential, it should fallback to OAuth2 auth", async () => {
      const credentialWithDelegation = await createInMemoryDelegationCredentialForBuildCalendarService({
        user: { email: null },
        delegatedTo: defaultDelegatedCredential,
        delegationCredentialId: "delegation-credential-id-1",
      });

      const calendarService = BuildCalendarService(credentialWithDelegation);
      mockSuccessfulCalendarListFetch();
      await calendarService.listCalendars();
      expectOAuth2InstanceToBeCreated();
    });
  });
});
