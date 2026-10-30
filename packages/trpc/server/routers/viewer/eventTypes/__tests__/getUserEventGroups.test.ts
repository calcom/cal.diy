import type { PrismaClient } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUserEventGroups } from "../getUserEventGroups.handler";

// Mock dependencies
const mockCheckPermission = vi.fn();
vi.mock("@calcom/features/permissions/services/PermissionCheckService", () => ({
  PermissionCheckService: class {
    checkPermission(...args: unknown[]): unknown {
      return mockCheckPermission(...args);
    }
  },
}));

vi.mock("@calcom/lib/checkRateLimitAndThrowError", () => ({
  checkRateLimitAndThrowError: vi.fn(),
}));

const { mockFindAllByUpIdIncludeTeam, MockMembershipRepository } = vi.hoisted(() => {
  const mockFindAllByUpIdIncludeTeam = vi.fn();
  const mockFindUniqueByUserIdAndTeamId = vi.fn();

  class MockMembershipRepository {
    static findAllByUpIdIncludeTeam = mockFindAllByUpIdIncludeTeam;
    findUniqueByUserIdAndTeamId = mockFindUniqueByUserIdAndTeamId;
  }

  return { mockFindAllByUpIdIncludeTeam, MockMembershipRepository };
});

vi.mock("@calcom/features/membership/repositories/MembershipRepository", () => ({
  MembershipRepository: MockMembershipRepository,
}));

vi.mock("@calcom/features/profile/repositories/ProfileRepository", () => ({
  ProfileRepository: {
    findByUpIdWithAuth: vi.fn(),
  },
}));

const mockFilterTeamsByEventTypeReadPermission = vi.fn();

vi.mock("../teamAccessUseCase", () => ({
  TeamAccessUseCase: vi.fn().mockImplementation(function () {
    return {
      filterTeamsByEventTypeReadPermission: mockFilterTeamsByEventTypeReadPermission,
    };
  }),
}));

vi.mock("@calcom/lib/getAvatarUrl", () => ({
  getUserAvatarUrl: vi.fn().mockReturnValue("https://avatar.com/user.jpg"),
}));

vi.mock("@calcom/lib/defaultAvatarImage", () => ({
  getPlaceholderAvatar: vi.fn().mockReturnValue("https://avatar.com/placeholder.jpg"),
}));

describe("getUserEventGroups", () => {
  const mockUser = {
    id: 1,
    profile: {
      upId: "user-123",
    },
  } as unknown as NonNullable<Parameters<typeof getUserEventGroups>[0]["ctx"]["user"]>;

  const mockProfile = {
    id: 1,
    username: "testuser",
    name: "Test User",
    avatarUrl: null,
    organizationId: null,
    organization: null,
  } as unknown as NonNullable<
    Awaited<
      ReturnType<
        typeof import("@calcom/features/profile/repositories/ProfileRepository").ProfileRepository.findByUpIdWithAuth
      >
    >
  >;

  const mockCtx = {
    user: mockUser,
    prisma: {} as PrismaClient,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckPermission.mockResolvedValue(true);
  });

  describe("Basic functionality", () => {
    it("should throw TRPCError when profile is not found", async () => {
      const { ProfileRepository } = await import("@calcom/features/profile/repositories/ProfileRepository");
      vi.mocked(ProfileRepository.findByUpIdWithAuth).mockResolvedValue(null);

      await expect(
        getUserEventGroups({
          ctx: mockCtx,
          input: null,
        })
      ).rejects.toThrow(TRPCError);
    });

    it("should return user event groups when no filters are applied", async () => {
      const { ProfileRepository } = await import("@calcom/features/profile/repositories/ProfileRepository");

      vi.mocked(ProfileRepository.findByUpIdWithAuth).mockResolvedValue(mockProfile);
      mockFindAllByUpIdIncludeTeam.mockResolvedValue([]);
      mockFilterTeamsByEventTypeReadPermission.mockResolvedValue([]);

      const result = await getUserEventGroups({
        ctx: mockCtx,
        input: null,
      });

      expect(result).toHaveProperty("eventTypeGroups");
      expect(result).toHaveProperty("profiles");
      expect(result.eventTypeGroups).toHaveLength(1);
      expect(result.eventTypeGroups[0]).toMatchObject({
        teamId: null,
        membershipRole: null,
        profile: {
          slug: "testuser",
          name: "Test User",
        },
      });
    });
  });

  describe("Team memberships", () => {
    it("should include team events when team memberships exist", async () => {
      const { ProfileRepository } = await import("@calcom/features/profile/repositories/ProfileRepository");

      const mockTeamMembership = {
        id: 1,
        teamId: 100,
        userId: 1,
        accepted: true,
        role: MembershipRole.MEMBER,
        customRoleId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        team: {
          id: 100,
          name: "Test Team",
          slug: "test-team",
          logoUrl: null,
          parentId: null,
          parent: null,
          metadata: {},
        },
      } as unknown as NonNullable<
        Awaited<
          ReturnType<
            typeof import("@calcom/features/membership/repositories/MembershipRepository").MembershipRepository.findAllByUpIdIncludeTeam
          >
        >
      >[0];

      vi.mocked(ProfileRepository.findByUpIdWithAuth).mockResolvedValue(mockProfile);
      mockFindAllByUpIdIncludeTeam.mockResolvedValue([mockTeamMembership]);
      mockFilterTeamsByEventTypeReadPermission.mockResolvedValue([mockTeamMembership]);

      const result = await getUserEventGroups({
        ctx: mockCtx,
        input: null,
      });

      expect(result.eventTypeGroups).toHaveLength(2); // User + Team
      expect(result.eventTypeGroups[1]).toMatchObject({
        teamId: 100,
        profile: {
          name: "Test Team",
          slug: "team/test-team",
        },
      });
    });
  });

  describe("Permissions", () => {
    it.each([true, false])("sets canCreateEventType to %s from PermissionCheckService", async (allowed) => {
      mockCheckPermission.mockResolvedValue(allowed);
      const { ProfileRepository } = await import("@calcom/features/profile/repositories/ProfileRepository");

      const mockTeamMembership = {
        id: 1,
        teamId: 100,
        userId: 1,
        accepted: true,
        role: MembershipRole.ADMIN,
        customRoleId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        team: {
          id: 100,
          name: "Test Team",
          slug: "test-team",
          logoUrl: null,
          parentId: null,
          parent: null,
          metadata: {},
        },
      } as unknown as NonNullable<
        Awaited<
          ReturnType<
            typeof import("@calcom/features/membership/repositories/MembershipRepository").MembershipRepository.findAllByUpIdIncludeTeam
          >
        >
      >[0];

      vi.mocked(ProfileRepository.findByUpIdWithAuth).mockResolvedValue(mockProfile);
      mockFindAllByUpIdIncludeTeam.mockResolvedValue([mockTeamMembership]);
      mockFilterTeamsByEventTypeReadPermission.mockResolvedValue([mockTeamMembership]);

      const result = await getUserEventGroups({
        ctx: mockCtx,
        input: null,
      });

      expect(result.teamPermissions[100]).toMatchObject({
        canCreateEventType: allowed,
      });
      expect(mockCheckPermission).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, teamId: 100, permission: "eventType.create" })
      );
    });
  });

  describe("Organization handling", () => {
    it("should handle organization locked event types", async () => {
      const { ProfileRepository } = await import("@calcom/features/profile/repositories/ProfileRepository");

      const mockProfileWithOrg = {
        ...mockProfile,
        organization: {
          organizationSettings: {
            lockEventTypeCreationForUsers: true,
          },
        },
      } as unknown as NonNullable<
        Awaited<
          ReturnType<
            typeof import("@calcom/features/profile/repositories/ProfileRepository").ProfileRepository.findByUpIdWithAuth
          >
        >
      >;

      vi.mocked(ProfileRepository.findByUpIdWithAuth).mockResolvedValue(mockProfileWithOrg);
      mockFindAllByUpIdIncludeTeam.mockResolvedValue([]);
      mockFilterTeamsByEventTypeReadPermission.mockResolvedValue([]);

      const result = await getUserEventGroups({
        ctx: mockCtx,
        input: null,
      });

      expect(result.eventTypeGroups[0].profile.eventTypesLockedByOrg).toBe(true);
    });
  });
});
