import { getWebhookFeature } from "@calcom/features/di/webhooks/containers/webhook";
import type { WebhookGroup } from "@calcom/features/webhooks/lib/dto/types";
import { UserPermissionRole } from "@calcom/prisma/enums";
import type { TrpcSessionUser } from "@calcom/trpc/server/types";

type GetByViewerOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
};

export type WebhooksByViewer = {
  webhookGroups: WebhookGroup[];
  profiles: {
    readOnly?: boolean | undefined;
    slug: string | null;
    name: string | null;
    image?: string | undefined;
    teamId: number | null | undefined;
  }[];
};

export const getByViewerHandler = async ({ ctx }: GetByViewerOptions): Promise<WebhooksByViewer> => {
  // Use the singleton instance to avoid creating new instances repeatedly
  const { repository: webhookRepository } = getWebhookFeature();
  return await webhookRepository.getFilteredWebhooksForUser({
    userId: ctx.user.id,
    userRole: ctx.user.role === "ADMIN" ? UserPermissionRole.ADMIN : UserPermissionRole.USER,
  });
};
