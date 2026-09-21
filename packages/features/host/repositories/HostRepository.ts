import type { PrismaClient } from "@calcom/prisma";
import { AppCategories } from "@calcom/prisma/enums";
import { safeCredentialSelect } from "@calcom/prisma/selects/credential";

export class HostRepository {
  constructor(private prismaClient: PrismaClient) {}

  async updateHostsSchedule(userId: number, oldScheduleId: number, newScheduleId: number) {
    return await this.prismaClient.host.updateMany({
      where: {
        userId,
        scheduleId: oldScheduleId,
      },
      data: {
        scheduleId: newScheduleId,
      },
    });
  }

  async findHostsCreatedInInterval({
    eventTypeId,
    userIds,
    startDate,
  }: {
    eventTypeId: number;
    userIds: number[];
    startDate: Date;
  }) {
    return await this.prismaClient.host.findMany({
      where: {
        userId: {
          in: userIds,
        },
        eventTypeId,
        isFixed: false,
        OR: [{ memberId: null }, { member: { status: "ACTIVE" } }],
        createdAt: {
          gte: startDate,
        },
      },
    });
  }

  async findHostsWithLocationOptions(eventTypeId: number) {
    return await this.prismaClient.host.findMany({
      where: {
        eventTypeId,
        OR: [{ memberId: null }, { member: { status: "ACTIVE" } }],
      },
      select: {
        userId: true,
        isFixed: true,
        priority: true,
        location: {
          select: {
            id: true,
            type: true,
            credentialId: true,
            link: true,
            address: true,
            phoneNumber: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            metadata: true,
            credentials: {
              where: {
                app: {
                  categories: {
                    hasSome: [AppCategories.conferencing, AppCategories.video],
                  },
                },
              },
              select: safeCredentialSelect,
            },
          },
        },
      },
      orderBy: [{ user: { name: "asc" } }, { priority: "desc" }],
    });
  }

  async findHostsWithLocationOptionsPaginated({
    eventTypeId,
    cursor,
    limit = 10,
  }: {
    eventTypeId: number;
    cursor?: number;
    limit?: number;
  }) {
    const hosts = await this.prismaClient.host.findMany({
      where: {
        eventTypeId,
        OR: [{ memberId: null }, { member: { status: "ACTIVE" } }],
        ...(cursor && { userId: { gt: cursor } }),
      },
      take: limit + 1,
      select: {
        userId: true,
        isFixed: true,
        priority: true,
        location: {
          select: {
            id: true,
            type: true,
            credentialId: true,
            link: true,
            address: true,
            phoneNumber: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            metadata: true,
            credentials: {
              where: {
                app: {
                  categories: {
                    hasSome: [AppCategories.conferencing, AppCategories.video],
                  },
                },
              },
              select: safeCredentialSelect,
            },
          },
        },
      },
      orderBy: [{ userId: "asc" }],
    });

    const hasMore = hosts.length > limit;
    const items = hasMore ? hosts.slice(0, limit) : hosts;
    const nextCursor = hasMore ? items[items.length - 1].userId : undefined;

    return { items, nextCursor, hasMore };
  }

  async findHostsPaginatedIncludeUser({
    eventTypeId,
    cursor,
    limit = 20,
    search,
  }: {
    eventTypeId: number;
    cursor?: number;
    limit?: number;
    search?: string;
  }) {
    const hosts = await this.prismaClient.host.findMany({
      where: {
        eventTypeId,
        OR: [{ memberId: null }, { member: { status: "ACTIVE" } }],
        ...(cursor && { userId: { gt: cursor } }),
        ...(search && {
          OR: [
            { user: { name: { contains: search, mode: "insensitive" as const } } },
            { user: { email: { contains: search, mode: "insensitive" as const } } },
          ],
        }),
      },
      take: limit + 1,
      select: {
        userId: true,
        isFixed: true,
        priority: true,
        weight: true,
        scheduleId: true,
        groupId: true,
        user: {
          select: {
            name: true,
            avatarUrl: true,
            timeZone: true,
          },
        },
      },
      orderBy: [{ userId: "asc" }],
    });

    const hasMore = hosts.length > limit;
    const items = hasMore ? hosts.slice(0, limit) : hosts;
    const nextCursor = hasMore ? items[items.length - 1].userId : undefined;

    return { items, nextCursor, hasMore };
  }

  async findHostsPaginatedIncludeUserForAssignment({
    eventTypeId,
    cursor,
    limit = 20,
    search,
    memberUserIds,
  }: {
    eventTypeId: number;
    cursor?: number;
    limit?: number;
    search?: string;
    memberUserIds?: number[];
  }) {
    const userIdFilter = memberUserIds !== undefined
      ? cursor
        ? { in: memberUserIds, gt: cursor }
        : { in: memberUserIds }
      : cursor
        ? { gt: cursor }
        : undefined;

    const hosts = await this.prismaClient.host.findMany({
      where: {
        eventTypeId,
        OR: [{ memberId: null }, { member: { status: "ACTIVE" } }],
        ...(userIdFilter && { userId: userIdFilter }),
        ...(search && {
          OR: [
            { user: { name: { contains: search, mode: "insensitive" as const } } },
            { user: { email: { contains: search, mode: "insensitive" as const } } },
          ],
        }),
      },
      take: limit + 1,
      select: {
        userId: true,
        isFixed: true,
        priority: true,
        weight: true,
        scheduleId: true,
        groupId: true,
        user: {
          select: {
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: [{ userId: "asc" }],
    });

    const hasMore = hosts.length > limit;
    const items = hasMore ? hosts.slice(0, limit) : hosts;
    const nextCursor = hasMore ? items[items.length - 1].userId : undefined;

    // Only check on the first page to avoid an extra query on every scroll
    const hasFixedHosts = !cursor
      ? (await this.prismaClient.host.count({
          where: { eventTypeId, isFixed: true },
          take: 1,
        })) > 0
      : undefined;

    return { items, nextCursor, hasMore, hasFixedHosts };
  }

  async findAllRoundRobinHosts({ eventTypeId }: { eventTypeId: number }) {
    return this.prismaClient.host.findMany({
      where: {
        eventTypeId,
        isFixed: false,
        OR: [{ memberId: null }, { member: { status: "ACTIVE" } }],
      },
      select: {
        userId: true,
        weight: true,
        user: {
          select: {
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: [{ userId: "asc" }],
    });
  }

  async findChildrenForAssignmentPaginated({
    eventTypeId,
    cursor,
    limit = 20,
    search,
  }: {
    eventTypeId: number;
    cursor?: number;
    limit?: number;
    search?: string;
  }) {
    const children = await this.prismaClient.eventType.findMany({
      where: {
        parentId: eventTypeId,
        ...(cursor && { id: { gt: cursor } }),
        ...(search && {
          OR: [
            { owner: { name: { contains: search, mode: "insensitive" as const } } },
            { owner: { email: { contains: search, mode: "insensitive" as const } } },
          ],
        }),
      },
      take: limit + 1,
      select: {
        id: true,
        slug: true,
        hidden: true,
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: [{ id: "asc" }],
    });

    const hasMore = children.length > limit;
    const items = hasMore ? children.slice(0, limit) : children;
    const nextCursor = hasMore ? items[items.length - 1].id : undefined;

    return { items, nextCursor, hasMore };
  }

  async findHostsWithConferencingCredentials(eventTypeId: number) {
    return await this.prismaClient.host.findMany({
      where: { 
        eventTypeId,
        OR: [{ memberId: null }, { member: { status: "ACTIVE" } }],
      },
      select: {
        userId: true,
        user: {
          select: {
            credentials: {
              where: {
                app: {
                  categories: {
                    hasSome: [AppCategories.conferencing, AppCategories.video],
                  },
                },
              },
              select: {
                id: true,
                type: true,
                appId: true,
              },
            },
          },
        },
      },
    });
  }
}
