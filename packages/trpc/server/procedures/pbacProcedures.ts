import { MembershipRole } from "@calcom/prisma/enums";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import authedProcedure from "./authedProcedure";
import { PermissionCheckService } from "@calcom/features/permissions/services/PermissionCheckService";

type PermissionString = string;

/**
 * Creates a procedure that checks team-level PBAC permissions.
 * The teamId is expected to come from input.teamId.
 *
 * @param permission - The specific permission required (e.g., "team.read", "team.update")
 * @param fallbackRoles - Roles to check when PBAC is disabled (defaults to ["ADMIN", "OWNER"])
 * @returns A procedure that checks the specified permission for the team
 */
function createTeamPbacProcedure(
  permission: PermissionString,
  fallbackRoles: MembershipRole[] = [MembershipRole.ADMIN, MembershipRole.OWNER]
): ReturnType<typeof authedProcedure.input> {
  return authedProcedure
    .input(
      z.object({
        teamId: z.number(),
      })
    )
    .use(async ({ ctx, input, next }) => {
      const permissionCheckService: PermissionCheckService = new PermissionCheckService();
      const hasPermission: boolean = await permissionCheckService.checkPermission({
        userId: ctx.user.id,
        teamId: input.teamId,
        permission,
        fallbackRoles,
      });

      if (!hasPermission) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Permission required: ${permission}`,
        });
      }

      return next();
    });
}

/**
 * Creates a procedure that checks organization-level PBAC permissions.
 * The organizationId is taken from ctx.user.organizationId.
 *
 * @param permission - The specific permission required (e.g., "organization.read", "organization.update")
 * @param fallbackRoles - Roles to check when PBAC is disabled (defaults to ["ADMIN", "OWNER"])
 * @returns A procedure that checks the specified permission for the organization and adds organizationId to context
 */
function createOrgPbacProcedure(
  permission: PermissionString,
  fallbackRoles: MembershipRole[] = [MembershipRole.ADMIN, MembershipRole.OWNER]
) {
  return authedProcedure.use(async ({ ctx, next }) => {
    const organizationId = ctx.user.organizationId;

    if (!organizationId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "You are not a member of any organization.",
      });
    }

    const permissionCheckService = new PermissionCheckService();
    const hasPermission = await permissionCheckService.checkPermission({
      userId: ctx.user.id,
      teamId: organizationId,
      permission,
      fallbackRoles,
    });

    if (!hasPermission) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Permission required: ${permission}`,
      });
    }

    return next({
      ctx: {
        ...ctx,
        organizationId,
      },
    });
  });
}

export { createTeamPbacProcedure, createOrgPbacProcedure };
