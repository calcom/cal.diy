import prismaMock from "@calcom/testing/lib/__mocks__/prismaMock";
import type { Credential } from "@calcom/prisma/client";
import type { CredentialPayload } from "@calcom/types/Credential";
import { afterEach, expect, test, vi } from "vitest";
import { refreshAccessToken } from "./helpers";
import type { BasecampToken } from "./types";

vi.mock("./getBasecampKeys", () => ({
  getBasecampKeys: vi.fn().mockResolvedValue({
    client_id: "test-client-id",
    client_secret: "test-client-secret",
    user_agent: "Cal.com (test@example.com)",
  }),
}));

afterEach(() => {
  vi.clearAllMocks();
  fetchMock.resetMocks();
});

const basecampKey: BasecampToken = {
  projectId: 1,
  scheduleId: 1,
  expires_at: 0,
  expires_in: 1209600,
  access_token: "old-access-token",
  refresh_token: "test-refresh-token",
  account: { id: 1, href: "", name: "", hidden: false, product: "", app_href: "" },
};

const credential = {
  id: 1,
  appId: "basecamp3",
  type: "basecamp3_other_calendar",
  userId: 1,
  user: { email: "test@example.com" },
  teamId: null,
  key: basecampKey,
  invalid: false,
  encryptedKey: null,
  delegationCredentialId: null,
} satisfies CredentialPayload;

const updatedCredentialRow: Credential = {
  id: credential.id,
  type: credential.type,
  key: { ...basecampKey, access_token: "new-access-token" },
  encryptedKey: null,
  userId: credential.userId,
  teamId: credential.teamId,
  appId: credential.appId,
  subscriptionId: null,
  paymentStatus: null,
  billingCycleStart: null,
  invalid: false,
  delegationCredentialId: null,
};

function mockTokenRefresh() {
  fetchMock.mockResponseOnce(JSON.stringify({ access_token: "new-access-token", expires_in: 1209600 }));
  prismaMock.credential.update.mockResolvedValue(updatedCredentialRow);
}

test("refresh request only sends the documented refresh params and omits redirect_uri", async () => {
  mockTokenRefresh();

  await refreshAccessToken(credential);

  expect(fetchMock).toHaveBeenCalledOnce();
  const url = new URL(fetchMock.mock.calls[0][0] as string);

  expect(url.origin + url.pathname).toBe("https://launchpad.37signals.com/authorization/token");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    type: "refresh",
    refresh_token: basecampKey.refresh_token,
    client_id: "test-client-id",
    client_secret: "test-client-secret",
  });
});

test("persists the refreshed token back to the existing credential", async () => {
  mockTokenRefresh();

  await refreshAccessToken(credential);

  expect(prismaMock.credential.update).toHaveBeenCalledOnce();
  const updateArgs = prismaMock.credential.update.mock.calls[0][0];
  expect(updateArgs.where).toEqual({ id: credential.id });
  expect(updateArgs.data.key).toMatchObject({
    access_token: "new-access-token",
    refresh_token: basecampKey.refresh_token,
  });
});
