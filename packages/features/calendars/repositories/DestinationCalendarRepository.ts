import logger from "@calcom/lib/logger";
import { buildCredentialPayloadForPrisma } from "@calcom/lib/server/buildCredentialPayloadForCalendar";
import type { PrismaClient } from "@calcom/prisma";
import { prisma } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";

const log = logger.getSubLogger({ prefix: ["DestinationCalendarRepository"] });

export class DestinationCalendarRepository {
  private prismaClient: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prismaClient = prismaClient ?? prisma;
  }

  async getCustomReminderByCredentialId(credentialId: number): Promise<number | null> {
    const destinationCalendar = await this.prismaClient.destinationCalendar.findFirst({
      where: { credentialId },
      select: { customCalendarReminder: true },
    });
    return destinationCalendar?.customCalendarReminder ?? null;
  }

  async updateCustomReminder({
    userId,
    credentialId,
    integration,
    customCalendarReminder,
  }: {
    userId: number;
    credentialId: number;
    integration: string;
    customCalendarReminder: number | null;
  }) {
    return await this.prismaClient.destinationCalendar.updateMany({
      where: {
        userId,
        credentialId,
        integration,
      },
      data: {
        customCalendarReminder,
      },
    });
  }

  static async create(data: Prisma.DestinationCalendarCreateInput) {
    return await prisma.destinationCalendar.create({
      data,
    });
  }

  static async createIfNotExistsForUser(
    data: { userId: number } & Prisma.DestinationCalendarUncheckedCreateInput
  ) {
    const conflictingCalendar = await DestinationCalendarRepository.findConflictingForUser(data);
    if (conflictingCalendar) {
      return conflictingCalendar;
    }
    return await prisma.destinationCalendar.create({
      data,
    });
  }

  static async getByUserId(userId: number) {
    return await prisma.destinationCalendar.findFirst({
      where: {
        userId,
      },
    });
  }

  /**
   * Idempotent delete — safe when the session still holds a stale destinationCalendar
   * after the row was already removed (e.g. credential cascade delete).
   */
  static async deleteByUserId(userId: number) {
    return await prisma.destinationCalendar.deleteMany({
      where: {
        userId,
      },
    });
  }

  static async getByEventTypeId(eventTypeId: number) {
    return await prisma.destinationCalendar.findFirst({
      where: {
        eventTypeId,
      },
    });
  }

  static async find({ where }: { where: Prisma.DestinationCalendarWhereInput }) {
    return await prisma.destinationCalendar.findFirst({
      where,
    });
  }

  private static async findConflictingForUser(data: {
    userId: number;
    integration: string;
    externalId: string;
  }) {
    return await DestinationCalendarRepository.find({
      where: {
        userId: data.userId,
        integration: data.integration,
        externalId: data.externalId,
        eventTypeId: null,
      },
    });
  }

  static async upsert({
    where,
    update,
    create,
  }: {
    where: Prisma.DestinationCalendarUpsertArgs["where"];
    update: {
      integration?: string;
      externalId?: string;
      credentialId?: number | null;
      primaryEmail?: string | null;
      delegationCredentialId?: string | null;
    };
    create: {
      userId?: number;
      eventTypeId?: number;
      integration: string;
      externalId: string;
      credentialId: number | null;
      primaryEmail?: string | null;
      delegationCredentialId?: string | null;
    };
  }) {
    log.debug("upsert", { where, update, create });
    const credentialPayloadForUpdate = buildCredentialPayloadForPrisma({
      credentialId: update.credentialId,
      delegationCredentialId: update.delegationCredentialId,
    });

    const credentialPayloadForCreate = buildCredentialPayloadForPrisma({
      credentialId: create.credentialId,
      delegationCredentialId: create.delegationCredentialId,
    });

    return await prisma.destinationCalendar.upsert({
      where,
      update: {
        ...update,
        ...credentialPayloadForUpdate,
      },
      create: {
        ...create,
        ...credentialPayloadForCreate,
      },
    });
  }
}
