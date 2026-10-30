import type { Membership, Team } from "@calcom/prisma/client";
import { PermissionCheckService } from "@calcom/features/permissions/services/PermissionCheckService";

type TeamMembershipWithTeam = Membership & {
  team: Team & {
    parent?: {
      id: number;
      name: string;
      slug: string | null;
      logoUrl: string | null;
      parentId: number | null;
      metadata: any;
    } | null;
  };
};

export class TeamAccessUseCase {
  constructor(private permissionCheckService: PermissionCheckService = new PermissionCheckService()) {}

  async filterTeamsByEventTypeReadPermission(
    memberships: TeamMembershipWithTeam[],
    userId: number
  ): Promise<TeamMembershipWithTeam[]> {
    const filteredMemberships = await Promise.all(
      memberships.map(async (membership) => {
        // Organization memberships are excluded from this logic
        if (membership.team.isOrganization) {
          return null;
        }

        // Check if user has eventType.read permission for this team
        const hasPermission = await this.permissionCheckService.checkPermission({
          userId,
          teamId: membership.team.id,
          permission: "eventType.read",
          fallbackRoles: ["ADMIN", "OWNER", "MEMBER"], // All roles can read event types by default
        });

        return hasPermission ? membership : null;
      })
    );

    return filteredMemberships.filter(
      (membership): membership is TeamMembershipWithTeam => membership !== null
    );
  }
}
