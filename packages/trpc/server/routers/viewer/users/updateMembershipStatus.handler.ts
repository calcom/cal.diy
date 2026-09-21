import type { PrismaClient } from "@calcom/prisma/client";
import { MembershipRepository } from "@calcom/features/membership/repositories/MembershipRepository";
import type { TrpcSessionUser } from "../../../types";
import type { ZUpdateMembershipStatusInput } from "./updateMembershipStatus.schema";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { MembershipRole } from "@calcom/prisma/enums";

type UpdateMembershipStatusOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
    prisma: PrismaClient;
  };
  input: z.infer<typeof ZUpdateMembershipStatusInput>;
};

export const updateMembershipStatusHandler = async ({ ctx, input }: UpdateMembershipStatusOptions) => {
  const { user, prisma } = ctx;
  const { userId, teamId, status } = input;

  // Check if current user is ADMIN or OWNER of the team
  const currentUserMembership = await prisma.membership.findUnique({
    where: {
      userId_teamId: {
        userId: user.id,
        teamId,
      },
    },
  });

  if (!currentUserMembership || (currentUserMembership.role !== MembershipRole.ADMIN && currentUserMembership.role !== MembershipRole.OWNER)) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "You must be a team owner or admin to update membership status." });
  }

  // Update status
  const targetMembership = await prisma.membership.findUnique({
    where: {
      userId_teamId: {
        userId,
        teamId,
      },
    },
  });

  if (!targetMembership) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Membership not found." });
  }

  await MembershipRepository.updateMembershipStatus(targetMembership.id, status);

  return { success: true, status };
};
