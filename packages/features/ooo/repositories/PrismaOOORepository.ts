import type { PrismaClient } from "@calcom/prisma";

export class PrismaOOORepository {
  constructor(private prismaClient: PrismaClient) {}

  async findManyOOO({
    startTimeDate,
    endTimeDate,
    allUserIds,
  }: {
    startTimeDate: Date;
    endTimeDate: Date;
    allUserIds: number[];
  }) {
    return this.prismaClient.outOfOfficeEntry.findMany({
      where: {
        userId: {
          in: allUserIds,
        },
        OR: [
          // outside of range
          // (start <= 'dateTo' AND end >= 'dateFrom')
          {
            start: {
              lte: endTimeDate,
            },
            end: {
              gte: startTimeDate,
            },
          },
          // start is between dateFrom and dateTo but end is outside of range
          // (start <= 'dateTo' AND end >= 'dateTo')
          {
            start: {
              lte: endTimeDate,
            },

            end: {
              gte: endTimeDate,
            },
          },
          // end is between dateFrom and dateTo but start is outside of range
          // (start <= 'dateFrom' OR end <= 'dateTo')
          {
            start: {
              lte: startTimeDate,
            },

            end: {
              lte: endTimeDate,
            },
          },
        ],
      },
      // Overlapping entries are flattened per-day downstream where the last entry wins, so a stable
      // order is required to make the winning entry reproducible across identical requests.
      orderBy: [{ start: "asc" }, { id: "asc" }],
      select: {
        id: true,
        start: true,
        end: true,
        notes: true,
        showNotePublicly: true,
        user: {
          select: {
            id: true,
            name: true,
          },
        },
        toUser: {
          select: {
            id: true,
            username: true,
            name: true,
          },
        },
        reason: {
          select: {
            id: true,
            emoji: true,
            reason: true,
          },
        },
      },
    });
  }

  async findUserOOODays({ userId, dateTo, dateFrom }: { userId: number; dateTo: string; dateFrom: string }) {
    return this.prismaClient.outOfOfficeEntry.findMany({
      where: {
        userId,
        OR: [
          // outside of range
          // (start <= 'dateTo' AND end >= 'dateFrom')
          {
            start: {
              lte: dateTo,
            },
            end: {
              gte: dateFrom,
            },
          },
          // start is between dateFrom and dateTo but end is outside of range
          // (start <= 'dateTo' AND end >= 'dateTo')
          {
            start: {
              lte: dateTo,
            },

            end: {
              gte: dateTo,
            },
          },
          // end is between dateFrom and dateTo but start is outside of range
          // (start <= 'dateFrom' OR end <= 'dateTo')
          {
            start: {
              lte: dateFrom,
            },

            end: {
              lte: dateTo,
            },
          },
        ],
      },
      // Overlapping entries are flattened per-day downstream where the last entry wins, so a stable
      // order is required to make the winning entry reproducible across identical requests.
      orderBy: [{ start: "asc" }, { id: "asc" }],
      select: {
        id: true,
        start: true,
        end: true,
        notes: true,
        showNotePublicly: true,
        user: {
          select: {
            id: true,
            name: true,
          },
        },
        toUser: {
          select: {
            id: true,
            username: true,
            name: true,
          },
        },
        reason: {
          select: {
            id: true,
            emoji: true,
            reason: true,
          },
        },
      },
    });
  }

  async findOOOEntriesInInterval({
    userIds,
    startDate,
    endDate,
  }: {
    userIds: number[];
    startDate: Date;
    endDate: Date;
  }) {
    return this.prismaClient.outOfOfficeEntry.findMany({
      where: {
        userId: {
          in: userIds,
        },
        start: {
          lte: endDate,
        },
        end: {
          gte: startDate,
        },
      },
      select: {
        start: true,
        end: true,
        userId: true,
      },
    });
  }
}
