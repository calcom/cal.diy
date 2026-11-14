import type { IEventTypesRepository } from "@calcom/features/eventtypes/eventtypes.repository.interface";
import { EventTypeRepository } from "@calcom/features/eventtypes/repositories/eventTypeRepository";
import { UsersRepository } from "@calcom/features/users/users.repository";
import type { IUsersRepository } from "@calcom/features/users/users.repository.interface";
import { getPlaceholderAvatar } from "@calcom/lib/defaultAvatarImage";
import { getUserAvatarUrl } from "@calcom/lib/getAvatarUrl";
import type { PrismaClient } from "@calcom/prisma";
import { prisma as defaultPrisma } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import type { TimeUnit, WebhookTriggerEvents } from "@calcom/prisma/enums";
import { MembershipRole, UserPermissionRole } from "@calcom/prisma/enums";
import type { Webhook, WebhookGroup, WebhookSubscriber } from "../dto/types";
import { WebhookOutputMapper } from "../infrastructure/mappers/WebhookOutputMapper";
import type {
  IWebhookRepository,
  ListWebhooksOptions,
  WebhookVersion,
} from "../interface/IWebhookRepository";
import { parseWebhookVersion } from "../interface/IWebhookRepository";
import type { GetSubscribersOptions } from "./types";
import { PermissionCheckService } from "@calcom/features/permissions/services/PermissionCheckService";

// Type for raw query results from the database
interface WebhookQueryResult {
  id: string;
  subscriberUrl: string;
  payloadTemplate: string | null;
  appId: string | null;
  secret: string | null;
  time: number | null;
  timeUnit: TimeUnit | null;
  eventTriggers: WebhookTriggerEvents[];
  version: WebhookVersion;
  priority: number; // This field is added by the query and removed before returning
}

const filterWebhooks = (webhook: { appId: string | null }): boolean => {
  const appIds = [
    "zapier",
    "make",
    // Add more if needed
  ];

  return !appIds.some((appId: string) => webhook.appId === appId);
};

export class WebhookRepository implements IWebhookRepository {
  private static _instance: WebhookRepository | undefined;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly eventTypeRepository: IEventTypesRepository,
    private readonly userRepository: IUsersRepository
  ) {}

  /**
   *
   * @deprecated Use DI container instead:
   * ```typescript
   * import { getWebhookFeature } from "@calcom/features/di/webhooks/containers/webhook";
   * const { repository } = getWebhookFeature();
   * ```
   *
   */
  static getInstance(): WebhookRepository {
    if (!WebhookRepository._instance) {
      WebhookRepository._instance = new WebhookRepository(
        defaultPrisma,
        new EventTypeRepository(defaultPrisma),
        new UsersRepository()
      );
    }
    return WebhookRepository._instance;
  }

  async getSubscribers(options: GetSubscribersOptions): Promise<WebhookSubscriber[]> {
    const teamId = options.teamId;
    const userId = options.userId;
    const eventTypeId = options.eventTypeId;
    const teamIds = Array.isArray(teamId) ? teamId : teamId ? [teamId] : undefined;
    const orgId = options.orgId;
    const oAuthClientId = options.oAuthClientId;

    let managedParentEventTypeId: number | undefined;
    if (eventTypeId) {
      managedParentEventTypeId =
        (await this.eventTypeRepository.findParentEventTypeId(eventTypeId)) ?? undefined;
    }

    const webhooks = await this.getSubscribersRaw({
      userId,
      eventTypeId,
      managedParentEventTypeId,
      teamIds: teamIds && orgId ? [...teamIds, orgId] : teamIds || (orgId ? [orgId] : undefined),
      oAuthClientId,
      triggerEvent: options.triggerEvent,
    });

    return webhooks.map((webhook) => ({
      id: webhook.id,
      subscriberUrl: webhook.subscriberUrl,
      payloadTemplate: webhook.payloadTemplate,
      appId: webhook.appId,
      secret: webhook.secret,
      time: webhook.time,
      timeUnit: webhook.timeUnit as TimeUnit | null,
      eventTriggers: webhook.eventTriggers as WebhookTriggerEvents[],
      version: webhook.version,
    }));
  }

  /**
   * Raw SQL query using UNION for better index utilization than complex ORs
   * Each UNION branch can use its own optimal index
   */
  private async getSubscribersRaw(params: {
    userId?: number | null;
    eventTypeId?: number | null;
    managedParentEventTypeId?: number | null;
    teamIds?: number[];
    oAuthClientId?: string | null;
    triggerEvent: WebhookTriggerEvents;
  }): Promise<WebhookSubscriber[]> {
    const { userId, eventTypeId, managedParentEventTypeId, teamIds, oAuthClientId, triggerEvent } = params;

    // IMPORTANT: Explicit type casts (::int, ::text) are required for nullable params
    // PostgreSQL can't infer types for NULL values without explicit casts
    const results = await this.prisma.$queryRaw<WebhookQueryResult[]>`
      -- Platform webhooks (highest priority)
      SELECT 
        id, "subscriberUrl", "payloadTemplate", "appId", secret, time, "timeUnit", "eventTriggers", version,
        1 as priority
      FROM "Webhook"
      WHERE active = true 
        AND platform = true 
        AND ${triggerEvent}::"WebhookTriggerEvents" = ANY("eventTriggers")
      
      UNION ALL
      
      -- User-specific webhooks (only if userId provided)
      SELECT 
        id, "subscriberUrl", "payloadTemplate", "appId", secret, time, "timeUnit", "eventTriggers", version,
        2 as priority
      FROM "Webhook"
      WHERE active = true 
        AND ${userId}::int IS NOT NULL
        AND "userId" = ${userId}::int
        AND ${triggerEvent}::"WebhookTriggerEvents" = ANY("eventTriggers")
        AND platform = false
      
      UNION ALL
      
      -- Event type webhooks (only if eventTypeId provided)
      SELECT 
        id, "subscriberUrl", "payloadTemplate", "appId", secret, time, "timeUnit", "eventTriggers", version,
        3 as priority
      FROM "Webhook"
      WHERE active = true 
        AND ${eventTypeId}::int IS NOT NULL
        AND "eventTypeId" = ${eventTypeId}::int
        AND ${triggerEvent}::"WebhookTriggerEvents" = ANY("eventTriggers")
        AND platform = false
      
      UNION ALL
      
      -- Parent event type webhooks (only if managedParentEventTypeId provided)
      SELECT 
        id, "subscriberUrl", "payloadTemplate", "appId", secret, time, "timeUnit", "eventTriggers", version,
        4 as priority
      FROM "Webhook"
      WHERE active = true 
        AND ${managedParentEventTypeId}::int IS NOT NULL
        AND "eventTypeId" = ${managedParentEventTypeId}::int
        AND ${triggerEvent}::"WebhookTriggerEvents" = ANY("eventTriggers")
        AND platform = false
      
      UNION ALL
      
      -- Team webhooks (only if teamIds provided and not empty)
      SELECT 
        id, "subscriberUrl", "payloadTemplate", "appId", secret, time, "timeUnit", "eventTriggers", version,
        5 as priority
      FROM "Webhook"
      WHERE active = true 
        AND ${teamIds}::int[] IS NOT NULL
        AND cardinality(${teamIds}::int[]) > 0
        AND "teamId" = ANY(${teamIds}::int[])
        AND ${triggerEvent}::"WebhookTriggerEvents" = ANY("eventTriggers")
        AND platform = false
      
      UNION ALL
      
      -- OAuth client webhooks (only if oAuthClientId provided)
      SELECT 
        id, "subscriberUrl", "payloadTemplate", "appId", secret, time, "timeUnit", "eventTriggers", version,
        6 as priority
      FROM "Webhook"
      WHERE active = true 
        AND ${oAuthClientId}::text IS NOT NULL
        AND "platformOAuthClientId" = ${oAuthClientId}::text
        AND ${triggerEvent}::"WebhookTriggerEvents" = ANY("eventTriggers")
        AND platform = false
      
      ORDER BY priority, id
    `;

    const uniqueWebhooks = new Map<string, WebhookSubscriber>();
    for (const webhook of results) {
      if (!uniqueWebhooks.has(webhook.id)) {
        const { priority: _priority, ...webhookData } = webhook;
        uniqueWebhooks.set(webhook.id, webhookData);
      }
    }

    return Array.from(uniqueWebhooks.values());
  }

  async getWebhookById(id: string): Promise<WebhookSubscriber | null> {
    const webhook = await this.prisma.webhook.findUnique({
      where: { id },
      select: {
        id: true,
        subscriberUrl: true,
        payloadTemplate: true,
        appId: true,
        secret: true,
        time: true,
        timeUnit: true,
        eventTriggers: true,
        version: true,
      },
    });

    if (!webhook) return null;

    return {
      id: webhook.id,
      subscriberUrl: webhook.subscriberUrl,
      payloadTemplate: webhook.payloadTemplate,
      appId: webhook.appId,
      secret: webhook.secret,
      time: webhook.time,
      timeUnit: webhook.timeUnit as TimeUnit | null,
      eventTriggers: webhook.eventTriggers,
      version: parseWebhookVersion(webhook.version),
    };
  }

  async findByWebhookId(webhookId?: string) {
    const webhook = await this.prisma.webhook.findUniqueOrThrow({
      where: {
        id: webhookId,
      },
      select: {
        id: true,
        subscriberUrl: true,
        payloadTemplate: true,
        active: true,
        eventTriggers: true,
        secret: true,
        teamId: true,
        userId: true,
        platform: true,
        time: true,
        timeUnit: true,
        version: true,
      },
    });

    return {
      ...webhook,
      version: parseWebhookVersion(webhook.version),
    };
  }

  async findByOrgIdAndTrigger({
    orgId,
    triggerEvent,
  }: {
    orgId: number;
    triggerEvent: WebhookTriggerEvents;
  }): Promise<WebhookSubscriber[]> {
    const webhooks = await this.prisma.webhook.findMany({
      where: {
        teamId: orgId,
        platform: false,
        eventTriggers: { has: triggerEvent },
        active: true,
      },
      select: {
        id: true,
        subscriberUrl: true,
        payloadTemplate: true,
        active: true,
        eventTriggers: true,
        secret: true,
        teamId: true,
        userId: true,
        platform: true,
        time: true,
        timeUnit: true,
        appId: true,
        version: true,
      },
    });
    return webhooks.map((webhook) => ({
      ...webhook,
      eventTriggers: webhook.eventTriggers as WebhookTriggerEvents[],
      version: parseWebhookVersion(webhook.version),
    }));
  }

  async getFilteredWebhooksForUser({ userId, userRole }: { userId: number; userRole?: UserPermissionRole }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        name: true,
        avatarUrl: true,
        webhooks: {
          select: {
            id: true,
            subscriberUrl: true,
            payloadTemplate: true,
            appId: true,
            secret: true,
            active: true,
            eventTriggers: true,
            eventTypeId: true,
            teamId: true,
            userId: true,
            time: true,
            timeUnit: true,
            version: true,
            createdAt: true,
            platform: true,
            platformOAuthClientId: true,
          },
        },
        teams: {
          where: {
            accepted: true,
          },
          select: {
            role: true,
            team: {
              select: {
                id: true,
                name: true,
                slug: true,
                logoUrl: true,
                webhooks: {
                  select: {
                    id: true,
                    subscriberUrl: true,
                    payloadTemplate: true,
                    appId: true,
                    secret: true,
                    active: true,
                    eventTriggers: true,
                    eventTypeId: true,
                    teamId: true,
                    userId: true,
                    time: true,
                    timeUnit: true,
                    version: true,
                    createdAt: true,
                    platform: true,
                    platformOAuthClientId: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    // Use permission service which handles both PBAC and role-based fallbacks
    const permissionService = new PermissionCheckService();

    // Build webhook groups with proper permissions
    const webhookGroups: WebhookGroup[] = [];

    // Add user's personal webhooks
    webhookGroups.push({
      teamId: null,
      profile: {
        slug: user.username,
        name: user.name,
        image: getUserAvatarUrl({ avatarUrl: user.avatarUrl }),
      },
      webhooks: WebhookOutputMapper.toWebhookList(user.webhooks.filter(filterWebhooks)),
      metadata: {
        canModify: true,
        canDelete: true,
      },
    });

    // Check permissions for each team
    // The permission service handles PBAC when enabled and falls back to role-based permissions
    for (const membership of user.teams) {
      const teamId = membership.team.id;

      // Check read permission (fallback: MEMBER, ADMIN, OWNER can read)
      const canRead = await permissionService.checkPermission({
        userId,
        teamId,
        permission: "webhook.read",
        fallbackRoles: [MembershipRole.MEMBER, MembershipRole.ADMIN, MembershipRole.OWNER],
      });

      if (!canRead) {
        // User doesn't have permission to view this team's webhooks
        continue;
      }

      // Check update/delete permissions in parallel (fallback: only ADMIN, OWNER can modify)
      const [canUpdate, canDelete] = await Promise.all([
        permissionService.checkPermission({
          userId,
          teamId,
          permission: "webhook.update",
          fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
        }),
        permissionService.checkPermission({
          userId,
          teamId,
          permission: "webhook.delete",
          fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
        }),
      ]);

      webhookGroups.push({
        teamId: membership.team.id,
        profile: {
          name: membership.team.name,
          slug: membership.team.slug || null,
          image: getPlaceholderAvatar(membership.team.logoUrl, membership.team.name),
        },
        webhooks: WebhookOutputMapper.toWebhookList(membership.team.webhooks.filter(filterWebhooks)),
        metadata: {
          canModify: canUpdate,
          canDelete,
        },
      });
    }

    // Add platform webhooks for admins
    if (userRole === UserPermissionRole.ADMIN) {
      const platformWebhooks = await this.prisma.webhook.findMany({
        where: { platform: true },
        select: {
          id: true,
          subscriberUrl: true,
          payloadTemplate: true,
          appId: true,
          secret: true,
          active: true,
          eventTriggers: true,
          eventTypeId: true,
          teamId: true,
          userId: true,
          time: true,
          timeUnit: true,
          version: true,
          createdAt: true,
          platform: true,
          platformOAuthClientId: true,
        },
      });

      webhookGroups.push({
        teamId: null,
        profile: {
          slug: "Platform",
          name: "Platform",
          image: getPlaceholderAvatar(null, "Platform"),
        },
        webhooks: WebhookOutputMapper.toWebhookList(platformWebhooks),
        metadata: {
          canDelete: true,
          canModify: true,
        },
      });
    }

    return {
      webhookGroups: webhookGroups.filter((group) => group.webhooks.length > 0),
      profiles: webhookGroups.map((group) => ({
        teamId: group.teamId,
        ...group.profile,
        ...group.metadata,
      })),
    };
  }

  /**
   * List webhooks for a user with filtering options.
   * Handles:
   * - App filtering (excludes zapier/make by default unless appId specified)
   * - Event type filtering (with managed event type parent handling)
   * - Event trigger filtering
   * - Permission-based team filtering
   */
  async listWebhooks(options: ListWebhooksOptions): Promise<Webhook[]> {
    const { userId, appId, eventTypeId, eventTriggers } = options;

    // Build WHERE conditions
    const whereConditions: NonNullable<Prisma.WebhookWhereInput["AND"]> = [
      // AppId filter - null appId by default (excludes zapier/make)
      { appId: appId ?? null },
    ];

    const user = await this.userRepository.findUserTeams(userId);

    if (eventTypeId) {
      const managedParentId = await this.eventTypeRepository.findParentEventTypeId(eventTypeId);

      if (managedParentId) {
        // Include webhooks from both the event type and its parent (if active)
        whereConditions.push({
          OR: [{ eventTypeId }, { eventTypeId: managedParentId, active: true }],
        });
      } else {
        whereConditions.push({ eventTypeId });
      }
    } else {
      // No eventTypeId - filter by user and their allowed teams
      const permissionService = new PermissionCheckService();
      const teamIds = user?.teams?.map((m) => m.teamId) ?? [];

      const allowedTeamIds = (
        await Promise.all(
          teamIds.map(async (teamId) => {
            const ok = await permissionService.checkPermission({
              userId,
              teamId,
              permission: "webhook.read",
              fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
            });
            return ok ? teamId : null;
          })
        )
      ).filter((x): x is number => x !== null);

      whereConditions.push({
        OR: [{ userId }, ...(allowedTeamIds.length ? [{ teamId: { in: allowedTeamIds } }] : [])],
      });
    }

    // Event triggers filter
    if (eventTriggers?.length) {
      whereConditions.push({ eventTriggers: { hasEvery: eventTriggers } });
    }

    const webhooks = await this.prisma.webhook.findMany({
      where: { AND: whereConditions },
      select: {
        id: true,
        subscriberUrl: true,
        payloadTemplate: true,
        appId: true,
        secret: true,
        active: true,
        eventTriggers: true,
        eventTypeId: true,
        teamId: true,
        userId: true,
        time: true,
        timeUnit: true,
        version: true,
        createdAt: true,
        platform: true,
        platformOAuthClientId: true,
      },
    });

    return WebhookOutputMapper.toWebhookList(webhooks);
  }
}
