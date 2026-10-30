import { MembershipRepository } from "@calcom/features/membership/repositories/MembershipRepository";
import { ProfileRepository } from "@calcom/features/profile/repositories/ProfileRepository";
import { checkRateLimitAndThrowError } from "@calcom/lib/checkRateLimitAndThrowError";
import type { PrismaClient } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";
import { TRPCError } from "@trpc/server";
import type { TrpcSessionUser } from "../../../types";
import type { TEventTypeInputSchema } from "./getByViewer.schema";
import { TeamAccessUseCase } from "./teamAccessUseCase";
import { EventGroupBuilder } from "./usecases/EventGroupBuilder";
import { ProfilePermissionProcessor } from "./usecases/ProfilePermissionProcessor";
import { EventTypeGroupFilter } from "./utils/EventTypeGroupFilter";
import { PermissionCheckService } from "@calcom/features/permissions/services/PermissionCheckService";

type GetByViewerOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
    prisma: PrismaClient;
  };
  input: TEventTypeInputSchema;
};

export const getUserEventGroups = async ({ ctx, input }: GetByViewerOptions) => {
  await checkRateLimitAndThrowError({
    identifier: `eventTypes:getUserProfiles:${ctx.user.id}`,
    rateLimitingType: "common",
  });

  const user = ctx.user;
  const userProfile = user.profile;

  // Validate profile exists and user has access
  const profile = await ProfileRepository.findByUpIdWithAuth(userProfile.upId, user.id);
  if (!profile) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  }

  // Initialize dependencies
  const dependencies = {
    membershipRepository: MembershipRepository,
    profileRepository: ProfileRepository,
    teamAccessUseCase: new TeamAccessUseCase(),
  };

  // Build event groups
  const eventGroupBuilder = new EventGroupBuilder(dependencies);
  const { eventTypeGroups, teamPermissionsMap } = await eventGroupBuilder.buildEventGroups({
    userId: user.id,
    userUpId: userProfile.upId,
    filters: input?.filters,
  });

  const filteredEventTypeGroups = new EventTypeGroupFilter(eventTypeGroups, teamPermissionsMap)
    .has("eventType.read")
    .get();

  // Process profiles with permissions
  const profileProcessor = new ProfilePermissionProcessor();
  const profiles = profileProcessor.processProfiles(eventTypeGroups, teamPermissionsMap);

  const permissionCheckService = new PermissionCheckService();

  const teamIdsToCheck = filteredEventTypeGroups
    .map((group) => group.teamId)
    .filter((teamId): teamId is number => teamId !== null && teamId !== undefined);

  const teamPermissionChecks = teamIdsToCheck.map(async (teamId) => {
    const canCreateEventType = await permissionCheckService.checkPermission({
      userId: user.id,
      teamId: teamId,
      permission: "eventType.create",
      fallbackRoles: [MembershipRole.OWNER, MembershipRole.ADMIN],
    });
    return {
      teamId,
      permissions: {
        canCreateEventType,
      },
    };
  });

  const teamPermissionsArray = await Promise.all(teamPermissionChecks);
  const teamPermissions = teamPermissionsArray.reduce(
    (acc, item) => {
      acc[item.teamId] = item.permissions;
      return acc;
    },
    {} as Record<number, { canCreateEventType: boolean }>
  );

  return {
    eventTypeGroups: filteredEventTypeGroups,
    profiles,
    teamPermissions,
  };
};

// Re-export the compareMembership function for backward compatibility
export { compareMembership } from "@calcom/features/eventtypes/lib/getEventTypesByViewer";
