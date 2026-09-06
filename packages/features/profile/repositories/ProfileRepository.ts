import { getOrgUsernameFromEmail } from "@calcom/features/auth/signup/utils/getOrgUsernameFromEmail";
import { DATABASE_CHUNK_SIZE } from "@calcom/lib/constants";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import prisma from "@calcom/prisma";
import type { Prisma, PrismaClient, User as PrismaUser, Team } from "@calcom/prisma/client";
import { MembershipRole } from "@calcom/prisma/enums";
import { userMetadata } from "@calcom/prisma/zod-utils";
import type { UpId, UserAsPersonalProfile, UserProfile } from "@calcom/types/UserProfile";
import { v4 as uuidv4 } from "uuid";
import type { IProfileRepository } from "./IProfileRepository";

const whereClauseForOrgWithSlugOrRequestedSlug = (..._args: unknown[]) => ({});
const getParsedTeam = <T>(team: T): T => team;

const userSelect = {
  name: true,
  avatarUrl: true,
  username: true,
  id: true,
  email: true,
  locale: true,
  defaultScheduleId: true,
  bufferTime: true,
  isPlatformManaged: true,
} satisfies Prisma.UserSelect;

const membershipSelect = {
  id: true,
  teamId: true,
  userId: true,
  accepted: true,
  role: true,
} satisfies Prisma.MembershipSelect;

const log = logger.getSubLogger({ prefix: ["repository/profile"] });
const organizationSettingsSelect = {
  allowSEOIndexing: true,
  orgProfileRedirectsToVerifiedDomain: true,
  disableAutofillOnBookingPage: true,
} satisfies Prisma.OrganizationSettingsSelect;
const organizationSelect = {
  id: true,
  slug: true,
  name: true,
  metadata: true,
  logoUrl: true,
  bannerUrl: true,
  isPlatform: true,
  hideBranding: true,
  brandColor: true,
  darkBrandColor: true,
  theme: true,
};
const organizationWithSettingsSelect = {
  ...organizationSelect,
  organizationSettings: {
    select: organizationSettingsSelect,
  },
};

const organizationWithSettingsAndMembersSelect = {
  ...organizationSelect,
  isPrivate: true,
  organizationSettings: {
    select: {
      lockEventTypeCreationForUsers: true,
      allowSEOIndexing: true,
    },
  },
  members: {
    select: membershipSelect,
    where: {
      accepted: true,
    },
  },
};

const profileSelect = {
  id: true,
  uid: true,
  userId: true,
  organizationId: true,
  username: true,
  createdAt: true,
  updatedAt: true,
};

export enum LookupTarget {
  User,
  Profile,
}

export class ProfileRepository implements IProfileRepository {
  private prismaClient: PrismaClient;

  constructor(deps: { prismaClient: PrismaClient }) {
    this.prismaClient = deps.prismaClient;
  }

  static generateProfileUid() {
    return uuidv4();
  }

  // This is a minimal replication of UserRepository.findById only selecting the data we need here to prevent circular dependency
  private static async findUserByid({ id }: { id: number }) {
    const user = await prisma.user.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        username: true,
        name: true,
        avatarUrl: true,
        bufferTime: true,
        metadata: true,
      },
    });

    if (!user) {
      return null;
    }
    return {
      ...user,
      metadata: userMetadata.parse(user.metadata),
    };
  }

  private static getInheritedDataFromUser({
    user,
  }: {
    user: Pick<PrismaUser, "name" | "avatarUrl" | "bufferTime">;
  }) {
    return {
      name: user.name,
      avatarUrl: user.avatarUrl,
      bufferTime: user.bufferTime,
    };
  }
  /**
   * Parses a Universal Profile ID (upId) into a lookup target.
   * - "usr-{id}" → { type: User, id }
   * - "prof-{uuid}" → { type: Profile, uid } (no `id`)
   * - "{numericId}" → { type: Profile, id } (legacy)
   * For profiles, always check for `uid` first; `id` may be undefined.
   */
  static getLookupTarget(upId: UpId) {
    if (upId.trim() === "") {
      return {
        type: LookupTarget.Profile,
        id: -1,
      } as const;
    }
    if (upId.startsWith("usr-")) {
      return {
        type: LookupTarget.User,
        id: parseInt(upId.replace("usr-", ""), 10),
      } as const;
    }
    if (upId.startsWith("prof-")) {
      // UUID-based profile identifier (new secure format)
      return {
        type: LookupTarget.Profile,
        uid: upId.replace("prof-", ""),
      } as const;
    }
    // Legacy support: numeric profile ID (deprecated, kept for backward compatibility)
    const numericId = parseInt(upId, 10);
    if (!Number.isNaN(numericId)) {
      return {
        type: LookupTarget.Profile,
        id: numericId,
      } as const;
    }
    throw new Error(`Invalid upId format: ${upId}`);
  }

  private static async _create({
    userId,
    organizationId,
    username,
    email,
    movedFromUserId,
  }: {
    userId: number;
    organizationId: number;
    username: string | null;
    email: string;
    movedFromUserId?: number;
  }) {
    log.debug("_create", safeStringify({ userId, organizationId, username, email }));
    return prisma.profile.create({
      data: {
        uid: ProfileRepository.generateProfileUid(),
        user: {
          connect: {
            id: userId,
          },
        },
        organization: {
          connect: {
            id: organizationId,
          },
        },
        ...(movedFromUserId
          ? {
              movedFromUser: {
                connect: {
                  id: movedFromUserId,
                },
              },
            }
          : null),

        username: username || email.split("@")[0],
      },
    });
  }

  /**
   * Accepts `email` as a source to derive username from when username is null
   * @returns
   */
  static create({
    userId,
    organizationId,
    username,
    email,
  }: {
    userId: number;
    organizationId: number;
    username: string | null;
    email: string;
  }) {
    return ProfileRepository._create({ userId, organizationId, username, email });
  }

  static async upsert({
    create,
    update,
    updateWhere,
  }: {
    create: {
      userId: number;
      organizationId: number;
      username: string | null;
      email: string;
    };
    update: {
      username: string | null;
      email: string;
    };
    updateWhere: {
      userId: number;
      organizationId: number;
    };
  }) {
    return prisma.profile.upsert({
      create: {
        uid: ProfileRepository.generateProfileUid(),
        user: {
          connect: {
            id: create.userId,
          },
        },
        organization: {
          connect: {
            id: create.organizationId,
          },
        },
        username: create.username || create.email.split("@")[0],
      },
      update: {
        username: update.username || update.email.split("@")[0],
      },
      where: {
        userId_organizationId: {
          userId: updateWhere.userId,
          organizationId: updateWhere.organizationId,
        },
      },
    });
  }

  static async createForExistingUser({
    userId,
    organizationId,
    username,
    email,
    movedFromUserId,
  }: {
    userId: number;
    organizationId: number;
    username: string | null;
    email: string;
    movedFromUserId: number;
  }) {
    return await ProfileRepository._create({
      userId,
      organizationId,
      username,
      email: email,
      movedFromUserId,
    });
  }

  static async createManyForExistingUsers({
    users,
    organizationId,
    orgAutoAcceptEmail,
  }: {
    users: { id: number; username: string | null; email: string }[];
    organizationId: number;
    orgAutoAcceptEmail: string;
  }) {
    await prisma.profile.createMany({
      data: users.map((user) => ({
        uid: ProfileRepository.generateProfileUid(),
        userId: user.id,
        organizationId,
        username: user?.username || getOrgUsernameFromEmail(user.email, orgAutoAcceptEmail),
      })),
      skipDuplicates: true,
    });

    // Populate the movedFromUser
    const createdProfiles = await prisma.profile.findMany({
      where: {
        userId: {
          in: users.map((user) => user.id),
        },
        organizationId,
      },
    });

    for (let i = 0; i < createdProfiles.length; i += DATABASE_CHUNK_SIZE) {
      const profilesBatch = createdProfiles.slice(i, i + DATABASE_CHUNK_SIZE);
      await Promise.allSettled(
        profilesBatch.map((profile) => {
          return prisma.user.update({
            where: {
              id: profile.userId,
            },
            data: {
              movedToProfile: {
                connect: { id: profile.id },
              },
            },
          });
        })
      );
    }
  }

  static async createManyPromise({
    users,
    organizationId,
    orgAutoAcceptEmail,
  }: {
    users: { id: number; username: string | null; email: string }[];
    organizationId: number;
    orgAutoAcceptEmail: string;
  }) {
    return await prisma.profile.createMany({
      data: users.map((user) => ({
        uid: ProfileRepository.generateProfileUid(),
        userId: user.id,
        organizationId,
        username: user?.username || getOrgUsernameFromEmail(user.email, orgAutoAcceptEmail),
      })),
      skipDuplicates: true,
    });
  }

  static createMany({
    users,
    organizationId,
    orgAutoAcceptEmail,
  }: {
    users: { id: number; username: string | null; email: string }[];
    organizationId: number;
    orgAutoAcceptEmail: string;
  }) {
    return prisma.profile.createMany({
      data: users.map((user) => ({
        uid: ProfileRepository.generateProfileUid(),
        userId: user.id,
        organizationId,
        username: user?.username || getOrgUsernameFromEmail(user.email, orgAutoAcceptEmail),
      })),
      skipDuplicates: true,
    });
  }

  static delete({ userId, organizationId }: { userId: number; organizationId: number }) {
    // Even though there can be just one profile matching a userId and organizationId, we are using deleteMany as it won't error if the profile doesn't exist
    return prisma.profile.deleteMany({
      where: { userId, organizationId },
    });
  }

  static deleteMany({ userIds, organizationId }: { userIds: number[]; organizationId: number }) {
    // Even though there can be just one profile matching a userId and organizationId, we are using deleteMany as it won't error if the profile doesn't exist
    return prisma.profile.deleteMany({
      where: { userId: { in: userIds }, organizationId },
    });
  }

  static async findByUserIdAndOrgId({
    userId,
    organizationId,
  }: {
    userId: number;
    organizationId: number | null;
  }) {
    if (!organizationId) {
      return null;
    }
    const profile = await prisma.profile.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
      include: {
        organization: {
          select: organizationSelect,
        },
        user: {
          select: userSelect,
        },
      },
    });

    if (!profile) {
      return null;
    }

    const organization = getParsedTeam(profile.organization);
    return normalizeProfile({
      ...profile,
      organization: {
        ...organization,
        requestedSlug: null,
        metadata: organization.metadata,
      },
    });
  }

  static async findByOrgIdAndUsername({
    organizationId,
    username,
  }: {
    organizationId: number;
    username: string;
  }) {
    const profile = await prisma.profile.findUnique({
      where: {
        username_organizationId: {
          username,
          organizationId,
        },
      },
      include: {
        organization: {
          select: organizationSelect,
        },
        user: {
          select: userSelect,
        },
      },
    });
    return profile;
  }

  static async findByUid(uid: string) {
    const profile = await prisma.profile.findFirst({
      where: {
        uid,
      },
      include: {
        user: {
          select: userSelect,
        },
        movedFromUser: {
          select: {
            id: true,
          },
        },
        organization: {
          select: organizationWithSettingsAndMembersSelect,
        },
      },
    });

    if (!profile) {
      return null;
    }

    return normalizeProfile(profile);
  }

  static async findByUpIdWithAuth(upId: string, userId: number) {
    const lookupTarget = ProfileRepository.getLookupTarget(upId);
    log.debug("findByUpIdWithAuth", safeStringify({ upId, lookupTarget, userId }));

    if (lookupTarget.type === LookupTarget.User) {
      const targetUserId = lookupTarget.id;

      if (targetUserId !== userId) {
        // Check if requesting user is an org admin/owner and can access target user's profile
        const canAccessAsAdmin = await ProfileRepository.checkOrgAdminAccessToUser({
          requestingUserId: userId,
          targetUserId,
        });

        if (!canAccessAsAdmin) {
          log.warn(
            "Unauthorized access attempt to user profile",
            safeStringify({ upId, userId, targetUserId })
          );
          return null;
        }
      }

      const user = await ProfileRepository.findUserByid({ id: targetUserId });
      if (!user) {
        return null;
      }
      return {
        username: user.username,
        upId: `usr-${user.id}`,
        id: null,
        organizationId: null,
        organization: null,
        ...ProfileRepository.getInheritedDataFromUser({ user }),
      };
    }

    let rawProfile;
    if ("uid" in lookupTarget) {
      // UUID-based lookup (new secure format)
      if (!lookupTarget.uid) {
        return null;
      }
      rawProfile = await prisma.profile.findFirst({
        where: { uid: lookupTarget.uid },
        include: {
          user: { select: userSelect },
          organization: {
            select: organizationWithSettingsAndMembersSelect,
          },
        },
      });
    } else {
      // Legacy numeric ID lookup (deprecated)
      rawProfile = await prisma.profile.findUnique({
        where: { id: lookupTarget.id },
        include: {
          user: { select: userSelect },
          movedFromUser: { select: { id: true } },
          organization: {
            select: {
              id: true,
              logoUrl: true,
              name: true,
              slug: true,
              metadata: true,
              bannerUrl: true,
              isPrivate: true,
              isPlatform: true,
              hideBranding: true,
              brandColor: true,
              darkBrandColor: true,
              theme: true,
              organizationSettings: {
                select: {
                  lockEventTypeCreationForUsers: true,
                  allowSEOIndexing: true,
                },
              },
              members: {
                select: membershipSelect,
                where: {
                  accepted: true,
                  user: { profiles: { some: { id: lookupTarget.id } } },
                },
              },
            },
          },
        },
      });
    }

    if (!rawProfile) {
      return null;
    }

    // Authorization check: verify user has access to this profile
    const profileId = rawProfile.id;
    const organizationId = rawProfile.organizationId;

    if (profileId && organizationId) {
      const hasAccess = await ProfileRepository.checkUserAccessToProfile({
        userId,
        profileId,
        organizationId,
      });

      if (!hasAccess) {
        log.warn(
          "Unauthorized access attempt to profile",
          safeStringify({ upId, userId, profileId, organizationId })
        );
        return null;
      }
    } else if (profileId) {
      // For personal profiles, check if user owns it
      if (rawProfile.userId !== userId) {
        log.warn("Unauthorized access attempt to profile", safeStringify({ upId, userId, profileId }));
        return null;
      }
    }

    const profile = normalizeProfile(rawProfile);
    const user = rawProfile.user;

    if (profile.organization?.isPlatform && !user.isPlatformManaged) {
      return {
        ...ProfileRepository.buildPersonalProfileFromUser({ user }),
        ...ProfileRepository.getInheritedDataFromUser({ user }),
      };
    }
    return {
      ...profile,
      ...ProfileRepository.getInheritedDataFromUser({ user }),
    };
  }

  private static async checkOrgAdminAccessToUser({
    requestingUserId,
    targetUserId,
  }: {
    requestingUserId: number;
    targetUserId: number;
  }): Promise<boolean> {
    const requestingUserOrgMemberships = await prisma.membership.findMany({
      where: {
        userId: requestingUserId,
        accepted: true,
        role: {
          in: [MembershipRole.ADMIN, MembershipRole.OWNER],
        },
        team: {
          isOrganization: true,
        },
      },
      select: {
        teamId: true,
      },
    });

    const orgIdsWhereRequestingUserIsAdmin = requestingUserOrgMemberships.map((m) => m.teamId);

    if (orgIdsWhereRequestingUserIsAdmin.length === 0) {
      return false;
    }

    const targetUserOrgMembership = await prisma.membership.findFirst({
      where: {
        userId: targetUserId,
        accepted: true,
        teamId: {
          in: orgIdsWhereRequestingUserIsAdmin,
        },
        team: {
          isOrganization: true,
        },
      },
      select: {
        userId: true,
      },
    });

    if (targetUserOrgMembership) {
      return true;
    }

    return false;
  }

  private static async checkUserAccessToProfile({
    userId,
    profileId,
    organizationId,
  }: {
    userId: number;
    profileId: number | null;
    organizationId: number | null;
  }): Promise<boolean> {
    if (!profileId || !organizationId) {
      return false;
    }

    // Check if user owns the profile
    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      select: { userId: true },
    });

    if (profile?.userId === userId) {
      return true;
    }

    const membership = await prisma.membership.findFirst({
      where: {
        userId,
        teamId: organizationId,
        accepted: true,
      },
      select: { id: true },
    });

    return !!membership;
  }

  static async findById(id: number | null) {
    if (!id) {
      return null;
    }

    const profile = await prisma.profile.findUnique({
      where: {
        id,
      },
      include: {
        user: {
          select: userSelect,
        },
        movedFromUser: {
          select: {
            id: true,
          },
        },
        organization: {
          select: {
            id: true,
            logoUrl: true,
            name: true,
            slug: true,
            metadata: true,
            bannerUrl: true,
            isPrivate: true,
            isPlatform: true,
            hideBranding: true,
            brandColor: true,
            darkBrandColor: true,
            theme: true,
            organizationSettings: {
              select: {
                lockEventTypeCreationForUsers: true,
                allowSEOIndexing: true,
              },
            },
            members: {
              distinct: ["role"],
              select: membershipSelect,
              where: {
                accepted: true,
                // Filter out memberships that are not owned by the user
                user: { profiles: { some: { id } } },
              },
            },
          },
        },
      },
    });

    if (!profile) {
      return null;
    }

    return normalizeProfile(profile);
  }

  static async findManyByOrgSlugOrRequestedSlug({
    usernames,
    orgSlug,
  }: {
    usernames: string[];
    orgSlug: string;
  }) {
    logger.debug("findManyByOrgSlugOrRequestedSlug", safeStringify({ usernames, orgSlug }));
    const profiles = await prisma.profile.findMany({
      where: {
        username: {
          in: usernames,
        },
        organization: whereClauseForOrgWithSlugOrRequestedSlug(orgSlug),
      },
      include: {
        user: {
          select: userSelect,
        },
        organization: {
          select: organizationWithSettingsSelect,
        },
      },
    });

    return profiles.map(normalizeProfile);
  }

  static async findAllProfilesForUserIncludingMovedUser(user: {
    id: number;
    username: string | null;
  }): Promise<UserProfile[]> {
    const profiles = await ProfileRepository.findManyForUser(user);
    // User isn't member of any organization. Also, he has no user profile. We build the profile from user table
    if (!profiles.length) {
      return [
        ProfileRepository.buildPersonalProfileFromUser({
          user,
        }),
      ];
    }

    return profiles;
  }

  static async findManyForUsers(userIds: number[]) {
    const profiles = await prisma.profile.findMany({
      where: {
        userId: {
          in: userIds,
        },
      },
      include: {
        organization: {
          select: organizationWithSettingsSelect,
        },
      },
    });

    return profiles.map((profile) => {
      const parsedOrganization = getParsedTeam(profile.organization);

      return normalizeProfile({
        username: profile.username,
        id: profile.id,
        userId: profile.userId,
        uid: profile.uid,
        name: parsedOrganization.name,
        organizationId: profile.organizationId,
        organization: {
          ...parsedOrganization,
          requestedSlug: null,
          metadata: parsedOrganization.metadata,
        },
      });
    });
  }

  static async findManyForUser(user: { id: number }) {
    const profiles = (
      await prisma.profile.findMany({
        where: {
          userId: user.id,
        },
        include: {
          organization: {
            select: organizationWithSettingsSelect,
          },
        },
      })
    )
      .map((profile) => {
        return {
          ...profile,
          organization: getParsedTeam(profile.organization),
        };
      })
      .map((profile) => {
        return normalizeProfile({
          username: profile.username,
          id: profile.id,
          userId: profile.userId,
          uid: profile.uid,
          name: profile.organization.name,
          organizationId: profile.organizationId,
          organization: {
            ...profile.organization,
            requestedSlug: null,
            metadata: profile.organization.metadata,
          },
        });
      });
    return profiles;
  }

  static async findFirstForUserId({ userId }: { userId: number }) {
    return prisma.profile.findFirst({
      where: {
        userId: userId,
      },
      select: profileSelect,
    });
  }

  /**
   * Returns the first organization ID the user belongs to, or null if none.
   * Used for org-specific blocking on personal events.
   *
   * TODO: When we support checking against multiple orgs, update this to return
   * all org IDs and check if user is blocked in ANY of them.
   */
  static async findFirstOrganizationIdForUser({ userId }: { userId: number }): Promise<number | null> {
    const profile = await prisma.profile.findFirst({
      where: { userId },
      select: { organizationId: true },
    });

    return profile?.organizationId ?? null;
  }

  static async findManyForOrg({ organizationId }: { organizationId: number }) {
    return await prisma.profile.findMany({
      where: {
        organizationId,
      },
      include: {
        user: {
          select: userSelect,
        },
        organization: {
          select: organizationSelect,
        },
      },
    });
  }

  static async findByUserIdAndProfileId({ userId, profileId }: { userId: number; profileId: number }) {
    const profile = await prisma.profile.findUnique({
      where: {
        userId,
        id: profileId,
      },
      include: {
        organization: {
          select: organizationSelect,
        },
        user: {
          select: userSelect,
        },
      },
    });
    if (!profile) {
      return profile;
    }
    return normalizeProfile(profile);
  }

  static async findByUserIdAndOrgSlug({
    userId,
    organizationId,
  }: {
    userId: number;
    organizationId: number;
  }) {
    const profile = await prisma.profile.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
      include: {
        organization: {
          select: organizationSelect,
        },
      },
    });
    return profile;
  }

  /**
   * Personal profile should come from Profile table only
   */
  static buildPersonalProfileFromUser({
    user,
  }: {
    user: { username: string | null; id: number };
  }): UserAsPersonalProfile {
    return {
      id: null,
      upId: `usr-${user.id}`,
      username: user.username,
      organizationId: null,
      organization: null,
    };
  }

  static _getPrismaWhereForProfilesOfOrg({ orgSlug }: { orgSlug: string | null }) {
    return {
      profiles: {
        ...(orgSlug
          ? {
              some: {
                organization: {
                  slug: orgSlug,
                },
              },
            }
          : // If it's not orgSlug we want to ensure that no profile is there. Having a profile means that the user is a member of some organization.
            {
              none: {},
            }),
      },
    };
  }

  async findFirstByUserId({ userId }: { userId: number }) {
    return this.prismaClient.profile.findFirst({
      where: {
        userId,
      },
      select: profileSelect,
    });
  }

  async findOrganizationProfileByUserId({ userId }: { userId: number }) {
    return this.prismaClient.profile.findFirst({
      where: { userId },
      select: {
        organizationId: true,
        username: true,
        organization: { select: { hideBranding: true } },
      },
    });
  }
}

export const normalizeProfile = <
  T extends {
    id: number;
    uid: string;
    organization: Pick<Team, keyof typeof organizationSelect>;
    createdAt?: Date;
    updatedAt?: Date;
  },
>(
  profile: T
) => {
  return {
    ...profile,
    upId: `prof-${profile.uid}`,
    organization: getParsedTeam(profile.organization),
    // Make these ↓ props ISO strings so that they can be returned from getServerSideProps as is without any issues
    ...(profile.createdAt ? { createdAt: profile.createdAt.toISOString() } : null),
    ...(profile.updatedAt ? { updatedAt: profile.updatedAt.toISOString() } : null),
  };
};
