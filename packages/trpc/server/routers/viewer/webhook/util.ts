import { prisma } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";

import { TRPCError } from "@trpc/server";

import authedProcedure from "../../../procedures/authedProcedure";
import { webhookIdAndEventTypeIdSchema } from "./types";

export const createWebhookProcedure = () => {
  return authedProcedure.input(webhookIdAndEventTypeIdSchema.optional()).use(async ({ ctx, input, next }) => {
    if (!input) return next();

    const { id, webhookId, eventTypeId } = input;
    const lookupId = id || webhookId;

    if (lookupId) {
      // Check if user is authorized to edit webhook
      const webhook = await prisma.webhook.findUnique({
        where: { id: lookupId },
        select: {
          id: true,
          userId: true,
          eventTypeId: true,
          teamId: true,
        },
      });

      if (!webhook) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (eventTypeId && eventTypeId !== webhook.eventTypeId) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      if (webhook.eventTypeId) {
        const eventType = await prisma.eventType.findUnique({
          where: { id: webhook.eventTypeId },
          select: { id: true, userId: true, teamId: true },
        });

        if (!eventType) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        if (webhook.teamId && eventType.teamId && webhook.teamId !== eventType.teamId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Webhook teamId must match eventType teamId" });
        }

        if (eventType.teamId) {
          const membership = await prisma.membership.findFirst({
            where: {
              teamId: eventType.teamId,
              userId: ctx.user.id,
              accepted: true,
              role: { in: [MembershipRole.ADMIN, MembershipRole.OWNER] },
            },
          });
          if (!membership) {
            throw new TRPCError({ code: "FORBIDDEN" });
          }
        } else if (eventType.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      } else if (webhook.teamId) {
        const membership = await prisma.membership.findFirst({
          where: {
            teamId: webhook.teamId,
            userId: ctx.user.id,
            accepted: true,
            role: { in: [MembershipRole.ADMIN, MembershipRole.OWNER] },
          },
        });
        if (!membership) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      } else if (webhook.userId && webhook.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
    } else if (eventTypeId) {
      const eventType = await prisma.eventType.findUnique({
        where: { id: eventTypeId },
        select: { id: true, userId: true, teamId: true },
      });

      if (!eventType) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (eventType.teamId) {
        const membership = await prisma.membership.findFirst({
          where: {
            teamId: eventType.teamId,
            userId: ctx.user.id,
            accepted: true,
            role: { in: [MembershipRole.ADMIN, MembershipRole.OWNER] },
          },
        });
        if (!membership) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      } else if (eventType.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
    }

    return next();
  });
};

export const webhookProcedure = createWebhookProcedure();
