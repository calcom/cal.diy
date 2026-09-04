import prismaMock from "@calcom/testing/lib/__mocks__/prismaMock";
import { enrichUserWithDelegationConferencingCredentialsWithoutOrgId } from "@calcom/app-store/delegationCredential";
import type { User } from "@calcom/prisma/client";
import type { TFunction } from "i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import getEnabledAppsFromCredentials from "./_utils/getEnabledAppsFromCredentials";
import { getLocationGroupedOptions } from "./server";

vi.mock("@calcom/app-store/delegationCredential", () => ({
  enrichUserWithDelegationConferencingCredentialsWithoutOrgId: vi.fn(),
}));

vi.mock("./_utils/getEnabledAppsFromCredentials", () => ({
  default: vi.fn(),
}));

const t = ((key: string) => key) as TFunction;

const storedCredential = {
  id: 1,
  type: "google_video",
  key: {},
  encryptedKey: null,
  userId: 42,
  user: { email: "user@example.com" },
  teamId: null,
  appId: "google-meet",
  invalid: false,
  delegationCredentialId: "delegation-credential-1",
  team: null,
  subscriptionId: null,
  billingCycleStart: null,
  paymentStatus: null,
};

const mockUser = {
  id: 42,
  email: "user@example.com",
} as unknown as User;

describe("getLocationGroupedOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEnabledAppsFromCredentials).mockResolvedValue([]);
    vi.mocked(enrichUserWithDelegationConferencingCredentialsWithoutOrgId).mockImplementation(
      async ({ user }) => user
    );
  });

  it("passes user credentials to the delegation enrichment with delegation fields as stored", async () => {
    prismaMock.user.findUnique.mockResolvedValue(mockUser);
    prismaMock.credential.findMany.mockResolvedValue([storedCredential]);

    await getLocationGroupedOptions({ userId: 42 }, t);

    const enrichMock = vi.mocked(enrichUserWithDelegationConferencingCredentialsWithoutOrgId);
    expect(enrichMock).toHaveBeenCalledTimes(1);
    const { user } = enrichMock.mock.calls[0][0];
    expect(user.credentials).toEqual([storedCredential]);
    expect(user.credentials[0].delegationCredentialId).toBe("delegation-credential-1");
  });

  it("marks credentials as non-delegation on the team path", async () => {
    prismaMock.team.findFirst.mockResolvedValue(null);
    prismaMock.credential.findMany.mockResolvedValue([storedCredential]);

    await getLocationGroupedOptions({ teamId: 7 }, t);

    expect(enrichUserWithDelegationConferencingCredentialsWithoutOrgId).not.toHaveBeenCalled();
    const [credentials] = vi.mocked(getEnabledAppsFromCredentials).mock.calls[0];
    expect(credentials[0]).toEqual({
      ...storedCredential,
      delegatedTo: null,
      delegatedToId: null,
      delegationCredentialId: null,
    });
  });
});
