import { MembershipRole } from "@calcom/prisma/enums";

import { PrismaPermissionMembershipRepository } from "../repositories/PrismaPermissionMembershipRepository";

type Role = MembershipRole | `${MembershipRole}`;

type CheckPermissionInput = {
  userId: number;
  teamId?: number | null;
  /** Kept for call-site compatibility. Access is decided by `fallbackRoles`. */
  permission?: string;
  fallbackRoles?: Role[];
};

type TeamIdsWithPermissionInput = {
  userId: number;
  permission?: string;
  fallbackRoles?: Role[];
  orgId?: number;
};

const INHERITED_ROLES: MembershipRole[] = [MembershipRole.ADMIN, MembershipRole.OWNER];

/**
 * Team permission checks based on membership roles.
 *
 * A user has a permission on a team when they hold an accepted membership of that team with one of the
 * caller's `fallbackRoles`. ADMIN and OWNER of a parent team also hold it on the parent's sub-teams.
 * No roles, no team, or no accepted membership means no access.
 */
export class PermissionCheckService {
  private repositoryPromise: Promise<PrismaPermissionMembershipRepository> | undefined;

  constructor(repository?: PrismaPermissionMembershipRepository) {
    if (repository) this.repositoryPromise = Promise.resolve(repository);
  }

  private getRepository() {
    this.repositoryPromise ??= PrismaPermissionMembershipRepository.withGlobalPrisma();
    return this.repositoryPromise;
  }

  async checkPermission({ userId, teamId, fallbackRoles }: CheckPermissionInput): Promise<boolean> {
    const roles = toRoles(fallbackRoles);
    if (!userId || !teamId || roles.length === 0) return false;

    const repository = await this.getRepository();
    if (await repository.hasAcceptedMembershipWithRole({ userId, teamIds: [teamId], roles })) return true;

    const inheritedRoles = roles.filter((role) => INHERITED_ROLES.includes(role));
    if (inheritedRoles.length === 0) return false;
    const parentId = await repository.findParentTeamId(teamId);
    if (!parentId) return false;
    return repository.hasAcceptedMembershipWithRole({ userId, teamIds: [parentId], roles: inheritedRoles });
  }

  async hasPermission(input: CheckPermissionInput): Promise<boolean> {
    return this.checkPermission(input);
  }

  async getTeamIdsWithPermission({ userId, fallbackRoles }: TeamIdsWithPermissionInput): Promise<number[]> {
    const roles = toRoles(fallbackRoles);
    if (!userId || roles.length === 0) return [];

    const repository = await this.getRepository();
    const teamIds = await repository.findTeamIdsWithAcceptedRole({ userId, roles });

    const inheritedRoles = roles.filter((role) => INHERITED_ROLES.includes(role));
    const parentTeamIds =
      inheritedRoles.length > 0
        ? await repository.findTeamIdsWithAcceptedRole({ userId, roles: inheritedRoles })
        : [];
    const childTeamIds = await repository.findChildTeamIds(parentTeamIds);

    return Array.from(new Set([...teamIds, ...childTeamIds]));
  }
}

function toRoles(fallbackRoles: Role[] | undefined): MembershipRole[] {
  const valid = new Set<string>(Object.values(MembershipRole));
  return (fallbackRoles ?? []).filter((role): role is MembershipRole => valid.has(role));
}
