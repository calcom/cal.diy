import { WEBAPP_URL } from "@calcom/lib/constants";
import { CreationSource, RedirectType } from "@calcom/prisma/enums";
import { UserSchema } from "@calcom/prisma/zod/modelSchema/UserSchema";
import { authedAdminProcedure } from "@calcom/trpc/server/procedures/authedProcedure";
import { router } from "@calcom/trpc/server/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { updateMembershipStatusHandler } from "./updateMembershipStatus.handler";
import { ZUpdateMembershipStatusInput } from "./updateMembershipStatus.schema";

export type UserAdminRouter = typeof userAdminRouter;
export type UserAdminRouterOutputs = inferRouterOutputs<UserAdminRouter>;

const userIdSchema = z.object({ userId: z.coerce.number() });

const userBodySchema = UserSchema.pick({
  name: true,
  email: true,
  username: true,
  bio: true,
  timeZone: true,
  weekStart: true,
  theme: true,
  defaultScheduleId: true,
  locale: true,
  timeFormat: true,
  // brandColor: true,
  // darkBrandColor: true,
  allowDynamicBooking: true,
  identityProvider: true,
  role: true,
  avatarUrl: true,
});

/** Reusable logic that checks for admin permissions and if the requested user exists */
//const authedAdminWithUserMiddleware = middleware();

const authedAdminProcedureWithRequestedUser = authedAdminProcedure.use(async ({ ctx, next, getRawInput }) => {
  const { prisma } = ctx;
  const parsed = userIdSchema.safeParse(await getRawInput());
  if (!parsed.success) throw new TRPCError({ code: "BAD_REQUEST", message: "User id is required" });
  const { userId: id } = parsed.data;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  return next({
    ctx: {
      user: ctx.user,
      requestedUser: user,
    },
  });
});

export const userAdminRouter = router({
  get: authedAdminProcedureWithRequestedUser.input(userIdSchema).query(async ({ ctx }) => {
    const { requestedUser } = ctx;
    return { user: requestedUser };
  }),
  list: authedAdminProcedure.query(async ({ ctx }) => {
    const { prisma } = ctx;
    // TODO: Add search, pagination, etc.
    const users = await prisma.user.findMany();
    return users;
  }),
  add: authedAdminProcedure.input(userBodySchema).mutation(async ({ ctx, input }) => {
    const { prisma } = ctx;
    const user = await prisma.user.create({ data: { ...input, creationSource: CreationSource.WEBAPP } });
    return { user, message: `User with id: ${user.id} added successfully` };
  }),
  update: authedAdminProcedureWithRequestedUser
    .input(userBodySchema.partial())
    .mutation(async ({ ctx, input }) => {
      const { prisma, requestedUser } = ctx;

      const user = await prisma.$transaction(async (tx) => {
        const userInternal = await tx.user.update({ where: { id: requestedUser.id }, data: input });

        // If the profile has been moved to an Org -> we can easily access the profile we need to update
        if (requestedUser.movedToProfileId && input.username) {
          const profile = await tx.profile.update({
            where: {
              id: requestedUser.movedToProfileId,
            },
            data: {
              username: input.username,
            },
          });

          // Update all of this users tempOrgRedirectUrls
          if (requestedUser.username && profile.organizationId) {
            const data = await prisma.team.findUnique({
              where: {
                id: profile.organizationId,
              },
              select: {
                slug: true,
              },
            });

            // We should never hit this
            if (!data?.slug) {
              throw new Error("Team has no attached slug.");
            }

            const orgUrlPrefix = WEBAPP_URL;

            const toUrl = `${orgUrlPrefix}/${input.username}`;

            await prisma.tempOrgRedirect.updateMany({
              where: {
                type: RedirectType.User,
                from: requestedUser.username, // Old username
              },
              data: {
                toUrl,
              },
            });
          }

          return userInternal;
        }

        /**
         * TODO (Sean/Hariom): Change this to profile specific when we have a way for a user to have > 1 orgs
         * If the user wasnt a CAL account before being moved to an org they dont have the movedToProfileId value
         * So we update all of their profiles to this new username - this tx will rollback if there is a username
         * conflict here somehow (Note for now users only have ONE profile.)
         **/
        if (input.username) {
          await tx.profile.updateMany({
            where: {
              userId: requestedUser.id,
            },
            data: {
              username: input.username,
            },
          });
        }

        return userInternal;
      });
      return { user, message: `User with id: ${user.id} updated successfully` };
    }),
  delete: authedAdminProcedureWithRequestedUser.input(userIdSchema).mutation(async ({ ctx }) => {
    const { prisma, requestedUser } = ctx;
    await prisma.user.delete({ where: { id: requestedUser.id } });
    return { message: `User with id: ${requestedUser.id} deleted successfully` };
  }),
  updateMembershipStatus: authedAdminProcedure
    .input(ZUpdateMembershipStatusInput)
    .mutation(updateMembershipStatusHandler),
});
