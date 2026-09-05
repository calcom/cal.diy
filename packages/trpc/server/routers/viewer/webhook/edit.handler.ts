import {
  updateTriggerForExistingBookings,
  deleteWebhookScheduledTriggers,
  cancelNoShowTasksForBooking,
} from "@calcom/features/webhooks/lib/scheduleTrigger";
import { validateUrlForSSRFSync } from "@calcom/lib/ssrfProtection";
import { prisma } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";
import type { TrpcSessionUser } from "@calcom/trpc/server/types";

import { TRPCError } from "@trpc/server";

import type { TEditInputSchema } from "./edit.schema";

type EditOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
  input: TEditInputSchema;
};

export const editHandler = async ({ input, ctx }: EditOptions) => {
  const { id, webhookId: _webhookId, ...data } = input;

  const webhook = await prisma.webhook.findUnique({
    where: {
      id,
    },
  });

  if (!webhook) {
    return null;
  }

  if (webhook.teamId) {
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
  }

  // SSRF validation: only validate if URL is being changed
  if (data.subscriberUrl && data.subscriberUrl !== webhook.subscriberUrl) {
    const validation = validateUrlForSSRFSync(data.subscriberUrl);
    if (!validation.isValid) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Webhook URL is not allowed: ${validation.error}`,
      });
    }
  }

  if (webhook.platform) {
    const { user } = ctx;
    if (user?.role !== "ADMIN") {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
  }

  const updatedWebhook= await prisma.webhook.update({
    where: {
      id,
    },
    data: {
      ...data,
      time: data.time ?? null,
      timeUnit: data.timeUnit ?? null,
    },
  });

  if (data.active) {
    const activeTriggersBefore = webhook.active ? webhook.eventTriggers : [];
    await updateTriggerForExistingBookings(webhook, activeTriggersBefore, updatedWebhook.eventTriggers);
  } else if (!data.active && webhook.active) {
    await cancelNoShowTasksForBooking({
      webhook: {
        id: webhook.id,
        userId: webhook.userId,
        teamId: webhook.teamId,
        eventTypeId: webhook.eventTypeId,
      },
    });
    await deleteWebhookScheduledTriggers({ webhookId: webhook.id });
  }

  return updatedWebhook;
};
