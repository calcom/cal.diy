import { WrongAssignmentReportRepository } from "@calcom/features/bookings/repositories/WrongAssignmentReportRepository";
import prisma from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";
import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import { TRPCError } from "@trpc/server";
import type { TUpdateWrongAssignmentReportStatusInputSchema } from "./updateWrongAssignmentReportStatus.schema";

type UpdateWrongAssignmentReportStatusOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
  input: TUpdateWrongAssignmentReportStatusInputSchema;
};

export const updateWrongAssignmentReportStatusHandler = async ({
  ctx,
  input,
}: UpdateWrongAssignmentReportStatusOptions) => {
  const { user } = ctx;
  const { reportId, status } = input;

  const repo = new WrongAssignmentReportRepository(prisma);

  const report = await repo.findTeamIdById(reportId);

  if (!report) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Report not found",
    });
  }

  const membership = await prisma.membership.findFirst({
    where: {
      userId: user.id,
      teamId: report.teamId,
      accepted: true,
    },
  });

  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not authorized to review reports for this team",
    });
  }

  const updatedReport = await repo.updateStatus({
    id: reportId,
    status,
    reviewedById: user.id,
  });

  return {
    success: true,
    report: updatedReport,
  };
};
