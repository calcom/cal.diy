import { prisma } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";
import { TRPCError } from "@trpc/server";

/**
 * teamId comes from client input - only accepted team ADMIN/OWNER members may
 * act on team resources (CVE-2026-109143)
 */
export async function assertTeamAdminPermission({
  userId,
  teamId,
}: {
  userId: number;
  teamId?: number;
}): Promise<void> {
  if (!teamId) return;

  const membership = await prisma.membership.findFirst({
    where: {
      teamId,
      userId,
      accepted: true,
      role: { in: [MembershipRole.ADMIN, MembershipRole.OWNER] },
    },
    select: { id: true },
  });

  if (!membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You must be an admin of this team" });
  }
}
