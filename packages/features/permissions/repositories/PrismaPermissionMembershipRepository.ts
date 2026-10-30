import type { PrismaClient } from "@calcom/prisma";
import type { MembershipRole } from "@calcom/prisma/enums";

export class PrismaPermissionMembershipRepository {
  constructor(private prismaClient: PrismaClient) {}

  static async withGlobalPrisma() {
    return new PrismaPermissionMembershipRepository((await import("@calcom/prisma")).prisma);
  }

  /** The team's parent team id, or null when it has none (or the team does not exist). */
  async findParentTeamId(teamId: number): Promise<number | null> {
    const team = await this.prismaClient.team.findUnique({
      where: { id: teamId },
      select: { parentId: true },
    });
    return team?.parentId ?? null;
  }

  /** Whether the user has an accepted membership of one of `teamIds` with one of `roles`. */
  async hasAcceptedMembershipWithRole({
    userId,
    teamIds,
    roles,
  }: {
    userId: number;
    teamIds: number[];
    roles: MembershipRole[];
  }): Promise<boolean> {
    const membership = await this.prismaClient.membership.findFirst({
      where: { userId, teamId: { in: teamIds }, accepted: true, role: { in: roles } },
      select: { id: true },
    });
    return !!membership;
  }

  /** Teams where the user has an accepted membership with one of `roles`. */
  async findTeamIdsWithAcceptedRole({
    userId,
    roles,
  }: {
    userId: number;
    roles: MembershipRole[];
  }): Promise<number[]> {
    const memberships = await this.prismaClient.membership.findMany({
      where: { userId, accepted: true, role: { in: roles } },
      select: { teamId: true },
    });
    return memberships.map((membership) => membership.teamId);
  }

  async findChildTeamIds(parentTeamIds: number[]): Promise<number[]> {
    if (parentTeamIds.length === 0) return [];
    const teams = await this.prismaClient.team.findMany({
      where: { parentId: { in: parentTeamIds } },
      select: { id: true },
    });
    return teams.map((team) => team.id);
  }
}
