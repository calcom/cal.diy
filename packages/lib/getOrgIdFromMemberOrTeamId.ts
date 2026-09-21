import { type PrismaTransaction, prisma } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";

const getOrgMemberOrTeamWhere = (memberId?: number | null, teamId?: number | null) => {
  const conditions: Prisma.TeamWhereInput[] = [];

  if (memberId) {
    conditions.push({
      AND: [
        {
          members: {
            some: {
              userId: memberId,
              accepted: true,
            },
          },
        },
        {
          isOrganization: true,
        },
      ],
    });
  }

  if (teamId) {
    conditions.push({
      AND: [
        {
          children: {
            some: {
              id: teamId,
            },
          },
        },
        {
          isOrganization: true,
        },
      ],
    });
  }

  return {
    OR: conditions,
  };
};

export default async function getOrgIdFromMemberOrTeamId(
  args: {
    memberId?: number | null;
    teamId?: number | null;
  },
  tx?: PrismaTransaction
) {
  const client = tx ?? prisma;
  const orgId = await client.team.findFirst({
    where: getOrgMemberOrTeamWhere(args.memberId, args.teamId),
    select: {
      id: true,
    },
  });
  return orgId?.id;
}

export async function getPublishedOrgIdFromMemberOrTeamId(args: {
  memberId?: number | null;
  teamId?: number | null;
}) {
  const orgId = await prisma.team.findFirst({
    where: {
      ...getOrgMemberOrTeamWhere(args.memberId, args.teamId),
      slug: { not: null },
    },
    select: {
      id: true,
    },
  });
  return orgId?.id;
}
