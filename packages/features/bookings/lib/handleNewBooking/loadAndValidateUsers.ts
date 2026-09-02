import { enrichUsersWithDelegationCredentials } from "@calcom/app-store/delegationCredential";
import { getQualifiedHostsService } from "@calcom/features/di/containers/QualifiedHosts";
import { ProfileRepository } from "@calcom/features/profile/repositories/ProfileRepository";
import { withSelectedCalendars } from "@calcom/features/users/repositories/UserRepository";
import { sentrySpan } from "@calcom/features/watchlist/lib/telemetry";
import { filterBlockedUsers } from "@calcom/features/watchlist/operations/filter-blocked-users.controller";
import getOrgIdFromMemberOrTeamId from "@calcom/lib/getOrgIdFromMemberOrTeamId";
import { HttpError } from "@calcom/lib/http-error";
import { getPiiFreeUser } from "@calcom/lib/piiFreeData";
import { safeStringify } from "@calcom/lib/safeStringify";
import { withReporting } from "@calcom/lib/sentryWrapper";
import prisma, { userSelect } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import { SchedulingType } from "@calcom/prisma/enums";
import { credentialForCalendarServiceSelect } from "@calcom/prisma/selects/credential";
import type { CredentialForCalendarService } from "@calcom/types/Credential";
import type { Logger } from "tslog";
import type { NewBookingEventType } from "./getEventTypesFromDB";
import { loadUsers } from "./loadUsers";

type Users = (Awaited<ReturnType<typeof loadUsers>>[number] & {
  isFixed?: boolean;
  metadata?: Prisma.JsonValue;
  createdAt?: Date;
})[];

export type UsersWithDelegationCredentials = (Omit<
  Awaited<ReturnType<typeof loadUsers>>[number],
  "credentials"
> & {
  isFixed?: boolean;
  metadata?: Prisma.JsonValue;
  createdAt?: Date;
  credentials: CredentialForCalendarService[];
})[];

type EventType = Pick<
  NewBookingEventType,
  | "hosts"
  | "users"
  | "id"
  | "userId"
  | "schedulingType"
  | "maxLeadThreshold"
  | "team"
  | "parent"
  | "assignAllTeamMembers"
  | "assignRRMembersUsingSegment"
  | "rrSegmentQueryValue"
  | "isRRWeightsEnabled"
  | "rescheduleWithSameRoundRobinHost"
  | "teamId"
  | "includeNoShowInRRCalculation"
  | "rrHostSubsetEnabled"
>;

type InputProps = {
  eventType: EventType;
  eventTypeId: number;
  dynamicUserList: string[];
  logger: Logger<unknown>;
  routedTeamMemberIds: number[] | null;
  contactOwnerEmail: string | null;
  rescheduleUid: string | null;
  isPlatform: boolean;
  hostname: string | undefined;
  forcedSlug: string | undefined;
  rrHostSubsetIds?: number[];
};

const _loadAndValidateUsers = async ({
  eventType,
  eventTypeId,
  dynamicUserList,
  logger,
  routedTeamMemberIds,
  contactOwnerEmail,
  rescheduleUid,
  isPlatform,
  hostname,
  forcedSlug,
  rrHostSubsetIds,
}: InputProps): Promise<{
  qualifiedRRUsers: UsersWithDelegationCredentials;
  additionalFallbackRRUsers: UsersWithDelegationCredentials;
  fixedUsers: UsersWithDelegationCredentials;
}> => {
  let users: Users = await loadUsers({
    eventType,
    dynamicUserList,
    hostname: hostname || "",
    forcedSlug,
    isPlatform,
    routedTeamMemberIds,
    contactOwnerEmail,
  });

  const isDynamicAllowed = !users.some((user) => !user.allowDynamicBooking);
  if (!isDynamicAllowed && !eventTypeId) {
    logger.warn({
      message: "NewBooking: Some of the users in this group do not allow dynamic booking",
    });
    throw new HttpError({
      message: "Some of the users in this group do not allow dynamic booking",
      statusCode: 400,
    });
  }

  // If this event was pre-relationship migration
  // TODO: Establish whether this is dead code.
  if (!users.length && eventType.userId) {
    const eventTypeUser = await prisma.user.findUnique({
      where: {
        id: eventType.userId,
      },
      select: {
        credentials: {
          select: credentialForCalendarServiceSelect,
        }, // Don't leak to client
        ...userSelect,
      },
    });
    if (!eventTypeUser) {
      logger.warn({ message: "NewBooking: eventTypeUser.notFound" });
      throw new HttpError({ statusCode: 404, message: "eventTypeUser.notFound" });
    }
    users.push(withSelectedCalendars(eventTypeUser));
  }

  if (!users) throw new HttpError({ statusCode: 404, message: "eventTypeUser.notFound" });

  // Get organizationId from eventType (handles org teams and managed events)
  let organizationId: number | null = eventType.parent?.team?.parentId ?? eventType.team?.parentId ?? null;

  // Fallback: For personal events, use the user's first org membership for org-specific blocking
  // TODO: When we support multiple orgs, revisit the logic
  if (!organizationId && eventType.userId) {
    organizationId = await ProfileRepository.findFirstOrganizationIdForUser({ userId: eventType.userId });
  }

  const { eligibleUsers, blockedCount } = await filterBlockedUsers(users, organizationId, sentrySpan);

  if (blockedCount > 0) {
    logger.info(`Filtered out ${blockedCount} blocked user(s) from booking`);
  }

  // If all users are blocked, throw 404
  // For team events with some eligible users, continue with graceful degradation
  if (eligibleUsers.length === 0) {
    throw new HttpError({ statusCode: 404, message: "eventTypeUser.notFound" });
  }

  users = eligibleUsers;

  // Exclude users whose membership is PAUSED in this team
  if (eventType.teamId) {
    const activeMemberships = await prisma.membership.findMany({
      where: {
        teamId: eventType.teamId,
        userId: { in: users.map((u) => u.id) },
        status: "ACTIVE",
      },
      select: { userId: true },
    });
    const activeUserIds = new Set(activeMemberships.map((m) => m.userId));
    users = users.filter((u) => activeUserIds.has(u.id));
    if (users.length === 0) {
      throw new HttpError({ statusCode: 404, message: "eventTypeUser.notFound" });
    }
  }

  // map fixed users
  users = users.map((user) => ({
    ...user,
    isFixed:
      user.isFixed === false
        ? false
        : user.isFixed || eventType.schedulingType !== SchedulingType.ROUND_ROBIN,
  }));
  const qualifiedHostsService = getQualifiedHostsService();
  const { qualifiedRRHosts, allFallbackRRHosts, fixedHosts } =
    await qualifiedHostsService.findQualifiedHostsWithDelegationCredentials({
      eventType,
      routedTeamMemberIds: routedTeamMemberIds || [],
      rescheduleUid,
      contactOwnerEmail,
      rrHostSubsetIds,
    });
  const allQualifiedHostsHashMap = [...qualifiedRRHosts, ...(allFallbackRRHosts ?? []), ...fixedHosts].reduce(
    (acc, host) => {
      if (host.user.id) {
        return { ...acc, [host.user.id]: host };
      }
      return acc;
    },
    {} as {
      [key: number]: Awaited<
        ReturnType<ReturnType<typeof getQualifiedHostsService>["findQualifiedHostsWithDelegationCredentials"]>
      >["qualifiedRRHosts"][number];
    }
  );

  let qualifiedRRUsers: UsersWithDelegationCredentials = [];
  let allFallbackRRUsers: UsersWithDelegationCredentials = [];
  let fixedUsers: UsersWithDelegationCredentials = [];

  if (qualifiedRRHosts.length) {
    // remove users that are not in the qualified hosts array
    const qualifiedHostIds = new Set(qualifiedRRHosts.map((qualifiedHost) => qualifiedHost.user.id));
    qualifiedRRUsers = users
      .filter((user) => qualifiedHostIds.has(user.id))
      .map((user) => ({ ...user, credentials: allQualifiedHostsHashMap[user.id].user.credentials }));
  }

  if (allFallbackRRHosts?.length) {
    const fallbackHostIds = new Set(allFallbackRRHosts.map((fallbackHost) => fallbackHost.user.id));
    allFallbackRRUsers = users
      .filter((user) => fallbackHostIds.has(user.id))
      .map((user) => ({ ...user, credentials: allQualifiedHostsHashMap[user.id].user.credentials }));
  }

  if (fixedHosts?.length) {
    const fixedHostIds = new Set(fixedHosts.map((fixedHost) => fixedHost.user.id));
    fixedUsers = users
      .filter((user) => fixedHostIds.has(user.id))
      .map((user) => ({ ...user, credentials: allQualifiedHostsHashMap[user.id].user.credentials }));
  }

  logger.debug(
    "Concerned users",
    safeStringify({
      users: users.map(getPiiFreeUser),
    })
  );

  const additionalFallbackRRUsers = allFallbackRRUsers.filter(
    (fallbackUser) => !qualifiedRRUsers.find((qualifiedUser) => qualifiedUser.id === fallbackUser.id)
  );

  if (!qualifiedRRUsers.length && !fixedUsers.length) {
    const firstUser = users[0];
    const firstUserOrgId = await getOrgIdFromMemberOrTeamId({
      memberId: firstUser.id ?? null,
      teamId: eventType.teamId,
    });
    const usersEnrichedWithDelegationCredential = await enrichUsersWithDelegationCredentials({
      orgId: firstUserOrgId ?? null,
      users,
    });
    return {
      qualifiedRRUsers,
      additionalFallbackRRUsers, // without qualified
      fixedUsers: usersEnrichedWithDelegationCredential,
    };
  }

  return {
    qualifiedRRUsers,
    additionalFallbackRRUsers, // without qualified
    fixedUsers,
  };
};

export const loadAndValidateUsers = withReporting(_loadAndValidateUsers, "loadAndValidateUsers");
