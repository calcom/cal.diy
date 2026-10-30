import { IdentityProvider } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcSessionUser } from "../../../types";

const {
  mockFindAllProfilesForUserIncludingMovedUser,
  mockEnrichUserWithTheProfile,
  mockFindUnique,
  mockFindMany,
  mockGetTeamIdsWithPermission,
  MockUserRepository,
  MockPermissionCheckService,
} = vi.hoisted(() => {
  const mockFindAllProfilesForUserIncludingMovedUser = vi.fn();
  const mockEnrichUserWithTheProfile = vi.fn();
  const mockFindUnique = vi.fn();
  const mockFindMany = vi.fn();
  const mockGetTeamIdsWithPermission = vi.fn();

  class MockUserRepository {
    enrichUserWithTheProfile = (...args: unknown[]) => mockEnrichUserWithTheProfile(...args);
  }

  class MockPermissionCheckService {
    getTeamIdsWithPermission = (...args: unknown[]) => mockGetTeamIdsWithPermission(...args);
  }

  return {
    mockFindAllProfilesForUserIncludingMovedUser,
    mockEnrichUserWithTheProfile,
    mockFindUnique,
    mockFindMany,
    mockGetTeamIdsWithPermission,
    MockUserRepository,
    MockPermissionCheckService,
  };
});

vi.mock("@calcom/features/profile/repositories/ProfileRepository", () => ({
  ProfileRepository: {
    findAllProfilesForUserIncludingMovedUser: (...args: unknown[]) =>
      mockFindAllProfilesForUserIncludingMovedUser(...args),
    buildPersonalProfileFromUser: vi.fn(() => ({ upId: "usr_1" })),
  },
}));

vi.mock("@calcom/features/users/repositories/UserRepository", () => ({
  UserRepository: MockUserRepository,
}));

vi.mock("@calcom/features/permissions/services/PermissionCheckService", () => ({
  PermissionCheckService: MockPermissionCheckService,
}));

vi.mock("@calcom/lib/getAvatarUrl", () => ({
  getUserAvatarUrl: vi.fn(() => "https://avatar.example.com/1"),
}));

vi.mock("@calcom/prisma", () => ({
  default: {
    secondaryEmail: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    account: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import { getHandler } from "./get.handler";

describe("getHandler - identity provider email lookup", () => {
  const baseUser = {
    id: 1,
    name: "Test User",
    email: "test@example.com",
    username: "testuser",
    emailVerified: new Date(),
    bufferTime: 0,
    locale: "en",
    timeFormat: 12,
    timeZone: "UTC",
    avatar: null,
    avatarUrl: null,
    createdDate: new Date(),
    trialEndsAt: null,
    defaultScheduleId: null,
    completedOnboarding: true,
    twoFactorEnabled: false,
    brandColor: "#000000",
    darkBrandColor: "#ffffff",
    bio: null,
    weekStart: "Monday",
    theme: null,
    appTheme: null,
    hideBranding: false,
    metadata: null,
    defaultBookerLayouts: null,
    allowDynamicBooking: true,
    allowSEOIndexing: true,
    receiveMonthlyDigestEmail: true,
    requiresBookerEmailVerification: false,
    role: "USER",
    organization: null,
    teams: [],
  };

  function createCtx(overrides: Partial<typeof baseUser> = {}) {
    return {
      user: { ...baseUser, ...overrides } as unknown as NonNullable<TrpcSessionUser>,
      session: { upId: "usr_1" } as any,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();

    mockFindAllProfilesForUserIncludingMovedUser.mockResolvedValue([]);
    mockEnrichUserWithTheProfile.mockImplementation(({ user }) => ({
      ...user,
      profile: null,
    }));
    mockFindMany.mockResolvedValue([]);
    mockGetTeamIdsWithPermission.mockResolvedValue([]);
    mockFindUnique.mockResolvedValue(null);
  });

  it("maps AZUREAD identity provider to 'azure-ad' in account lookup", async () => {
    const ctx = createCtx({
      identityProvider: IdentityProvider.AZUREAD,
      identityProviderId: "azure-provider-id-123",
    } as any);
    mockEnrichUserWithTheProfile.mockImplementation(({ user }) => ({
      ...user,
      identityProvider: IdentityProvider.AZUREAD,
      identityProviderId: "azure-provider-id-123",
      profile: null,
    }));
    mockFindUnique.mockResolvedValue({ providerEmail: "azure@example.com" });

    const result = await getHandler({ ctx, input: {} });

    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_providerAccountId: {
            provider: "azure-ad",
            providerAccountId: "azure-provider-id-123",
          },
        },
      })
    );
    expect(result.identityProviderEmail).toBe("azure@example.com");
  });

  it("maps GOOGLE identity provider to 'google' in account lookup", async () => {
    const ctx = createCtx({
      identityProvider: IdentityProvider.GOOGLE,
      identityProviderId: "google-id-456",
    } as any);
    mockEnrichUserWithTheProfile.mockImplementation(({ user }) => ({
      ...user,
      identityProvider: IdentityProvider.GOOGLE,
      identityProviderId: "google-id-456",
      profile: null,
    }));
    mockFindUnique.mockResolvedValue({ providerEmail: "google@example.com" });

    const result = await getHandler({ ctx, input: {} });

    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_providerAccountId: {
            provider: "google",
            providerAccountId: "google-id-456",
          },
        },
      })
    );
    expect(result.identityProviderEmail).toBe("google@example.com");
  });

  it("maps CAL identity provider to 'cal' in account lookup", async () => {
    const ctx = createCtx({
      identityProvider: IdentityProvider.CAL,
      identityProviderId: "cal-id-789",
    } as any);
    mockEnrichUserWithTheProfile.mockImplementation(({ user }) => ({
      ...user,
      identityProvider: IdentityProvider.CAL,
      identityProviderId: "cal-id-789",
      profile: null,
    }));
    mockFindUnique.mockResolvedValue(null);

    const result = await getHandler({ ctx, input: {} });

    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_providerAccountId: {
            provider: "cal",
            providerAccountId: "cal-id-789",
          },
        },
      })
    );
    expect(result.identityProviderEmail).toBe("");
  });

  it("returns empty string when no account found", async () => {
    const ctx = createCtx({
      identityProvider: IdentityProvider.AZUREAD,
      identityProviderId: "nonexistent-id",
    } as any);
    mockEnrichUserWithTheProfile.mockImplementation(({ user }) => ({
      ...user,
      identityProvider: IdentityProvider.AZUREAD,
      identityProviderId: "nonexistent-id",
      profile: null,
    }));
    mockFindUnique.mockResolvedValue(null);

    const result = await getHandler({ ctx, input: {} });

    expect(result.identityProviderEmail).toBe("");
  });
});
