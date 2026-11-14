import { EventTypeRepository } from "@calcom/features/eventtypes/repositories/eventTypeRepository";
import { MembershipRepository } from "@calcom/features/membership/repositories/MembershipRepository";
import { ProfileRepository } from "@calcom/features/profile/repositories/ProfileRepository";
import { checkRateLimitAndThrowError } from "@calcom/lib/checkRateLimitAndThrowError";
import type { PrismaClient } from "@calcom/prisma";
import { MembershipRole, SchedulingType } from "@calcom/prisma/enums";
import { EventTypeMetaDataSchema, teamMetadataSchema } from "@calcom/prisma/zod-utils";
import { TRPCError } from "@trpc/server";
import type { TrpcSessionUser } from "../../../types";
import type { TGetActiveOnOptionsSchema } from "./getActiveOnOptions.schema";
import { PermissionCheckService } from "@calcom/features/permissions/services/PermissionCheckService";

const listOtherTeamHandler = async (
  ..._args: unknown[]
): Promise<{ id: number; name: string; slug: string }[]> => [];

type GetActiveOnOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
    prisma: PrismaClient;
  };
  input: TGetActiveOnOptionsSchema;
};

type Option = {
  value: string;
  label: string;
};

type MembershipEventType = Awaited<
  ReturnType<typeof MembershipRepository.findAllByUpIdIncludeMinimalEventTypes>
>[number]["team"]["eventTypes"][number];

type EventType = Omit<MembershipEventType, "forwardParamsSuccessRedirect"> & {
  children?: { id: number }[];
  canSendCalVideoTranscriptionEmails?: boolean;
};

type EventTypeGroup = {
  teamId?: number | null;
  parentId?: number | null;
  bookerUrl?: string;
  profile: {
    slug?: string | null;
    name: string | null;
    image?: string;
    eventTypesLockedByOrg?: boolean;
  };
  eventTypes?: EventType[];
};

const fetchEventTypeGroups = async ({
  ctx,
  profile,
  parentOrgHasLockedEventTypes,
  skipEventTypes,
  teamId,
  teamIdsWithEventTypeUpdatePermission,
}: {
  ctx: { user: NonNullable<TrpcSessionUser>; prisma: PrismaClient };
  profile: NonNullable<Awaited<ReturnType<typeof ProfileRepository.findByUpIdWithAuth>>>;
  parentOrgHasLockedEventTypes: boolean | undefined;
  skipEventTypes: boolean;
  teamId?: number;
  teamIdsWithEventTypeUpdatePermission: number[];
}): Promise<EventTypeGroup[]> => {
  const user = ctx.user;
  const userProfile = ctx.user.profile;
  const eventTypeRepo = new EventTypeRepository(ctx.prisma);

  const [profileMemberships, profileEventTypes] = await Promise.all([
    MembershipRepository.findAllByUpIdIncludeMinimalEventTypes(
      {
        upId: userProfile.upId,
      },
      {
        where: {
          accepted: true,
        },
        skipEventTypes,
      }
    ),
    teamId
      ? []
      : eventTypeRepo.findAllByUpIdWithMinimalData(
          {
            upId: userProfile.upId,
            userId: user.id,
          },
          {
            where: {
              teamId: null,
            },
            orderBy: [
              {
                position: "desc",
              },
              {
                id: "asc",
              },
            ],
          }
        ),
  ]);

  const memberships = profileMemberships.map((membership) => ({
    ...membership,
    team: {
      ...membership.team,
      metadata: teamMetadataSchema.parse(membership.team.metadata),
    },
  }));

  const eventTypeGroups: EventTypeGroup[] = [];

  // Add user's personal event types
  eventTypeGroups.push({
    teamId: null,
    profile: {
      slug: profile.username,
      name: profile.name,
      eventTypesLockedByOrg: parentOrgHasLockedEventTypes,
    },
    eventTypes: profileEventTypes as EventType[],
  });

  // Add team event types
  const teamGroups = await Promise.all(
    memberships
      .filter((membership) => !membership?.team?.isOrganization)
      .map(async (membership) => {
        const team = {
          ...membership.team,
          metadata: teamMetadataSchema.parse(membership.team.metadata),
        };

        const canUpdateEventTypes = teamIdsWithEventTypeUpdatePermission.includes(team.id);
        const eventTypes = team.eventTypes
          ?.filter((evType) => evType.userId === null || evType.userId === user.id)
          ?.filter((evType) =>
            !canUpdateEventTypes ? evType.schedulingType !== SchedulingType.MANAGED : true
          );

        return {
          teamId: team.id,
          parentId: team.parentId,
          profile: {
            name: team.name,
          },
          eventTypes,
        };
      })
  );

  return eventTypeGroups.concat(teamGroups);
};

const fetchTeamOptions = async ({
  ctx,
  eventTypeGroups,
  skipTeamOptions,
}: {
  ctx: { user: NonNullable<TrpcSessionUser>; prisma: PrismaClient };
  eventTypeGroups: EventTypeGroup[];
  skipTeamOptions: boolean;
}): Promise<Option[]> => {
  if (skipTeamOptions) {
    return [];
  }

  const profileTeamsOptions = eventTypeGroups
    .filter((group) => !!group.teamId)
    .map((group) => ({
      value: String(group.teamId),
      label: group.profile.name || group.profile.slug || "",
    }));

  const otherTeams = await listOtherTeamHandler({ ctx });
  const otherTeamsOptions = otherTeams
    ? otherTeams.map((team) => ({
        value: String(team.id),
        label: team.name || team.slug || "",
      }))
    : [];

  return profileTeamsOptions.concat(otherTeamsOptions);
};

export const getActiveOnOptions = async ({ ctx, input }: GetActiveOnOptions) => {
  await checkRateLimitAndThrowError({
    identifier: `eventTypes:getActiveOnOptions.handler:${ctx.user.id}`,
    rateLimitingType: "common",
  });

  const user = ctx.user;
  const teamId = input.teamId;
  const isOrg = input.isOrg;

  const shouldIncludeTeamOptions = isOrg;
  const shouldSkipEventTypes = isOrg;

  const userProfile = ctx.user.profile;
  const profile = await ProfileRepository.findByUpIdWithAuth(userProfile.upId, ctx.user.id);
  const parentOrgHasLockedEventTypes =
    profile?.organization?.organizationSettings?.lockEventTypeCreationForUsers;

  if (!profile) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  }

  const permissionCheckService = new PermissionCheckService();
  const teamIdsWithEventTypeUpdatePermission = await permissionCheckService.getTeamIdsWithPermission({
    userId: user.id,
    permission: "eventType.update",
    fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
  });

  const eventTypeGroups = await fetchEventTypeGroups({
    ctx,
    profile,
    parentOrgHasLockedEventTypes,
    skipEventTypes: shouldSkipEventTypes,
    teamId,
    teamIdsWithEventTypeUpdatePermission,
  });

  const teamOptions = await fetchTeamOptions({
    ctx,
    eventTypeGroups,
    skipTeamOptions: !shouldIncludeTeamOptions,
  });

  const eventTypeOptions = eventTypeGroups.reduce((options, group) => {
    // Don't show team event types for user
    if (!teamId && group.teamId) return options;
    // Only show correct team event types for team
    if (teamId && teamId !== group.teamId) return options;

    const groupEventTypes =
      group?.eventTypes
        ?.filter((evType) => {
          const metadata = EventTypeMetaDataSchema.parse(evType.metadata);
          return !metadata?.managedEventConfig || !!teamId;
        })
        ?.map((eventType) => ({
          value: String(eventType.id),
          label: `${eventType.title}${eventType?.children?.length ? ` (+${eventType.children.length})` : ""}`,
        })) ?? [];

    return [...options, ...groupEventTypes];
  }, [] as Option[]);

  return {
    eventTypeOptions,
    teamOptions,
  };
};
