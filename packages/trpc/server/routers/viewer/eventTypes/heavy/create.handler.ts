import { getDefaultLocations } from "@calcom/app-store/_utils/getDefaultLocations";
import { DailyLocationType } from "@calcom/app-store/constants";
import { EventTypeRepository } from "@calcom/features/eventtypes/repositories/eventTypeRepository";
import type { PrismaClient } from "@calcom/prisma";
import { Prisma } from "@calcom/prisma/client";
import { MembershipRole, SchedulingType } from "@calcom/prisma/enums";
import type { eventTypeLocations } from "@calcom/prisma/zod-utils";
import { TRPCError } from "@trpc/server";
import type { z } from "zod";
import type { TrpcSessionUser } from "../../../../types";
import type { TCreateInputSchema } from "./create.schema";
import { PermissionCheckService } from "@calcom/features/permissions/services/PermissionCheckService";

type EventTypeLocation = z.infer<typeof eventTypeLocations>[number];

type SessionUser = NonNullable<TrpcSessionUser>;
type User = {
  id: SessionUser["id"];
  role: SessionUser["role"];
  organizationId: SessionUser["organizationId"];
  organization: {
    isOrgAdmin: SessionUser["organization"]["isOrgAdmin"];
  };
  profile: {
    id: SessionUser["id"] | null;
  };
  metadata: SessionUser["metadata"];
  email: SessionUser["email"];
};

type CreateOptions = {
  ctx: {
    user: User;
    prisma: PrismaClient;
  };
  input: TCreateInputSchema;
};

export const createHandler = async ({ ctx, input }: CreateOptions) => {
  const {
    schedulingType,
    teamId,
    metadata,
    locations: inputLocations,
    scheduleId,
    calVideoSettings,
    ...rest
  } = input;

  const userId = ctx.user.id;
  const isManagedEventType = schedulingType === SchedulingType.MANAGED;
  const isOrgAdmin = !!ctx.user?.organization?.isOrgAdmin;

  const permissionService = new PermissionCheckService();
  // Check if user has organization-level eventType.create permission (equivalent to org admin for event types)
  let hasOrgEventTypeCreatePermission = isOrgAdmin; // Default fallback

  if (ctx.user.organizationId) {
    hasOrgEventTypeCreatePermission = await permissionService.checkPermission({
      userId,
      teamId: ctx.user.organizationId,
      permission: "eventType.create",
      fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
    });
  }

  const locations: EventTypeLocation[] =
    inputLocations && inputLocations.length !== 0 ? inputLocations : await getDefaultLocations(ctx.user);

  const isCalVideoLocationActive = locations.some((location) => location.type === DailyLocationType);

  const data: Prisma.EventTypeCreateInput = {
    ...rest,
    owner: teamId ? undefined : { connect: { id: userId } },
    metadata: (metadata as Prisma.InputJsonObject) ?? undefined,
    // Only connecting the current user for non-managed event types and non team event types
    users: isManagedEventType || schedulingType ? undefined : { connect: { id: userId } },
    locations,
    schedule: scheduleId ? { connect: { id: scheduleId } } : undefined,
  };

  if (isCalVideoLocationActive && calVideoSettings) {
    data.calVideoSettings = {
      create: {
        disableRecordingForGuests: calVideoSettings.disableRecordingForGuests ?? false,
        disableRecordingForOrganizer: calVideoSettings.disableRecordingForOrganizer ?? false,
        enableAutomaticTranscription: calVideoSettings.enableAutomaticTranscription ?? false,
        enableAutomaticRecordingForOrganizer: calVideoSettings.enableAutomaticRecordingForOrganizer ?? false,
        disableTranscriptionForGuests: calVideoSettings.disableTranscriptionForGuests ?? false,
        disableTranscriptionForOrganizer: calVideoSettings.disableTranscriptionForOrganizer ?? false,
        redirectUrlOnExit: calVideoSettings.redirectUrlOnExit ?? null,
        requireEmailForGuests: calVideoSettings.requireEmailForGuests ?? false,
      },
    };
  }

  if (teamId && schedulingType) {
    const isSystemAdmin = ctx.user.role === "ADMIN";

    // Only check for team-level permissions - this will also check for membership
    const hasCreatePermission = await permissionService.checkPermission({
      userId,
      teamId,
      permission: "eventType.create",
      fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
    });

    if (!isSystemAdmin && !hasCreatePermission) {
      // Organization-level permission only covers teams inside the user's own organization.
      const team = hasOrgEventTypeCreatePermission
        ? await ctx.prisma.team.findUnique({ where: { id: teamId }, select: { parentId: true } })
        : null;
      const isTeamInUsersOrg = !!ctx.user.organizationId && team?.parentId === ctx.user.organizationId;

      if (!isTeamInUsersOrg) {
        // The user is neither an admin of the team nor of the organization the team belongs to.
        console.warn(`User ${userId} does not have eventType.create permission for team ${teamId}`);
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
    }

    data.team = {
      connect: {
        id: teamId,
      },
    };
    data.schedulingType = schedulingType;
  }

  // If we are in an organization & they don't have org-level eventType.create permission & they are not creating an event on a teamID
  // Check if evenTypes are locked.
  if (ctx.user.organizationId && !hasOrgEventTypeCreatePermission && !teamId) {
    const orgSettings = await ctx.prisma.organizationSettings.findUnique({
      where: {
        organizationId: ctx.user.organizationId,
      },
      select: {
        lockEventTypeCreationForUsers: true,
      },
    });

    const orgHasLockedEventTypes = !!orgSettings?.lockEventTypeCreationForUsers;
    if (orgHasLockedEventTypes) {
      console.warn(
        `User ${userId} does not have permission to create this new event type - Locked status: ${orgHasLockedEventTypes}`
      );
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
  }

  const profile = ctx.user.profile;
  try {
    const eventTypeRepo = new EventTypeRepository(ctx.prisma);
    const eventType = await eventTypeRepo.create({
      ...data,
      profileId: profile.id,
    });
    return { eventType };
  } catch (e) {
    console.warn(e);
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002" && Array.isArray(e.meta?.target) && e.meta?.target.includes("slug")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "URL Slug already exists for given user." });
      }
    }
    throw new TRPCError({ code: "BAD_REQUEST" });
  }
};
