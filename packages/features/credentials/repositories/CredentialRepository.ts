import { buildNonDelegationCredential } from "@calcom/lib/delegationCredential";
import logger from "@calcom/lib/logger";
import { prisma } from "@calcom/prisma";
import type { Prisma, PrismaClient } from "@calcom/prisma/client";
import { safeCredentialSelect } from "@calcom/prisma/selects/credential";
import { credentialForCalendarServiceSelect } from "@calcom/prisma/selects/credential";

const log = logger.getSubLogger({ prefix: ["CredentialRepository"] });

type CredentialCreateInput = {
  type: string;
  key: object;
  userId: number;
  appId: string;
  delegationCredentialId?: string | null;
  encryptedKey?: string | null;
};

type CredentialUpdateInput = {
  type?: string;
  key?: object;
  userId?: number;
  appId?: string;
  delegationCredentialId?: string | null;
  invalid?: boolean;
};

export class CredentialRepository {
  constructor(private prismaClient: PrismaClient) {}

  async findPaymentAppCredentials({
    credentialId,
    userId,
  }: {
    credentialId?: number | null;
    userId: number;
  }) {
    return this.prismaClient.credential.findMany({
      where: {
        userId,
        ...(credentialId && { id: credentialId }),
        app: { categories: { hasSome: ["payment"] } },
      },
      select: {
        key: true,
        appId: true,
        app: { select: { categories: true, dirName: true } },
      },
    });
  }

  async findByCredentialId(id: number) {
    return this.prismaClient.credential.findUnique({
      where: { id },
      select: safeCredentialSelect,
    });
  }

  async findByIds({ ids }: { ids: number[] }): Promise<{ id: number; appId: string | null }[]> {
    if (ids.length === 0) return [];
    return this.prismaClient.credential.findMany({
      where: { id: { in: ids } },
      select: { id: true, appId: true },
    });
  }

  async findByIdWithDelegationCredential(id: number) {
    return this.prismaClient.credential.findUnique({
      where: { id },
      select: {
        ...credentialForCalendarServiceSelect,
        delegationCredential: true,
      },
    });
  }

  static async create(data: CredentialCreateInput) {
    const credential = await prisma.credential.create({
      data,
    });
    return buildNonDelegationCredential(credential);
  }
  static async findByAppIdAndUserId({ appId, userId }: { appId: string; userId: number }) {
    const credential = await prisma.credential.findFirst({
      where: {
        appId,
        userId,
      },
    });
    return buildNonDelegationCredential(credential);
  }

  /**
   * Doesn't retrieve key field as that has credentials
   */
  static async findFirstByIdWithUser({ id }: { id: number }) {
    const credential = await prisma.credential.findUnique({
      where: { id },
      select: safeCredentialSelect,
    });
    return buildNonDelegationCredential(credential);
  }

  /**
   * Includes 'key' field which is sensitive data.
   */
  static async findFirstByIdWithKeyAndUser({ id }: { id: number }) {
    const credential = await prisma.credential.findUnique({
      where: { id },
      select: { ...safeCredentialSelect, key: true, encryptedKey: true },
    });
    return buildNonDelegationCredential(credential);
  }

  static async findFirstByAppIdAndUserId({ appId, userId }: { appId: string; userId: number }) {
    return await prisma.credential.findFirst({
      where: {
        appId,
        userId,
      },
    });
  }

  static async findFirstByUserIdAndType({ userId, type }: { userId: number; type: string }) {
    const credential = await prisma.credential.findFirst({
      where: { userId, type },
    });
    return buildNonDelegationCredential(credential);
  }

  static async deleteById({ id }: { id: number }) {
    await prisma.credential.delete({ where: { id } });
  }

  static async updateCredentialById({ id, data }: { id: number; data: CredentialUpdateInput }) {
    await prisma.credential.update({
      where: { id },
      data,
    });
  }

  static async deleteAllByDelegationCredentialId({
    delegationCredentialId,
  }: {
    delegationCredentialId: string;
  }) {
    return prisma.credential.deleteMany({ where: { delegationCredentialId } });
  }

  static async findCredentialForCalendarServiceById({ id }: { id: number }) {
    const dbCredential = await prisma.credential.findUnique({
      where: { id },
      select: credentialForCalendarServiceSelect,
    });

    if (!dbCredential) {
      return dbCredential;
    }

    return buildNonDelegationCredential(dbCredential);
  }

  static async findByIdIncludeDelegationCredential({ id }: { id: number }) {
    const dbCredential = await prisma.credential.findUnique({
      where: { id },
      select: {
        ...credentialForCalendarServiceSelect,
        delegationCredential: true,
      },
    });

    return dbCredential;
  }

  static async findAllDelegationByUserIdsListAndDelegationCredentialIdAndType({
    userIds,
    delegationCredentialId,
    type,
  }: {
    userIds: number[];
    delegationCredentialId: string;
    type: string;
  }) {
    return prisma.credential.findMany({
      where: {
        userId: {
          in: userIds,
        },
        delegationCredentialId,
        type,
      },
      select: {
        userId: true,
      },
    });
  }

  static async findAllDelegationByTypeIncludeUserAndTake({ type, take }: { type: string; take: number }) {
    const delegationUserCredentials = await prisma.credential.findMany({
      where: {
        delegationCredentialId: { not: null },
        type,
      },
      include: {
        user: {
          select: {
            email: true,
            id: true,
          },
        },
      },
      take,
    });
    return delegationUserCredentials.map(({ delegationCredentialId, ...rest }) => {
      return {
        ...rest,
        // We queried only those where delegationCredentialId is not null

        delegationCredentialId: delegationCredentialId!,
      };
    });
  }

  static async findUniqueByUserIdAndDelegationCredentialId({
    userId,
    delegationCredentialId,
  }: {
    userId: number;
    delegationCredentialId: string;
  }) {
    const delegationUserCredentials = await prisma.credential.findMany({
      where: {
        userId,
        delegationCredentialId,
      },
    });

    if (delegationUserCredentials.length > 1) {
      // Instead of crashing use the first one and log for observability
      // TODO: Plan to add a unique constraint on userId and delegationCredentialId
      log.error(`DelegationCredential: Multiple delegation user credentials found - this should not happen`, {
        userId,
        delegationCredentialId,
      });
    }

    return delegationUserCredentials[0];
  }

  static async updateWhereUserIdAndDelegationCredentialId({
    userId,
    delegationCredentialId,
    data,
  }: {
    userId: number;
    delegationCredentialId: string;
    data: {
      key: Prisma.InputJsonValue;
    };
  }) {
    return prisma.credential.updateMany({
      where: {
        userId,
        delegationCredentialId,
      },
      data,
    });
  }

  static async createDelegationCredential({
    userId,
    delegationCredentialId,
    type,
    key,
    appId,
    encryptedKey,
  }: {
    userId: number;
    delegationCredentialId: string;
    type: string;
    key: Prisma.InputJsonValue;
    appId: string;
    encryptedKey?: string | null;
  }) {
    return prisma.credential.create({
      data: { userId, delegationCredentialId, type, key, appId, ...(encryptedKey && { encryptedKey }) },
    });
  }

  static async updateWhereId({ id, data }: { id: number; data: { key: Prisma.InputJsonValue } }) {
    return prisma.credential.update({ where: { id }, data });
  }

  static async findPaymentCredentialByAppIdAndTeamId({
    appId,
    teamId,
  }: {
    appId: string | null;
    teamId: number;
  }) {
    return await prisma.credential.findFirst({
      where: {
        teamId,
        appId,
      },
      include: {
        app: true,
      },
    });
  }

  static async findPaymentCredentialByAppIdAndUserId({
    appId,
    userId,
  }: {
    appId: string | null;
    userId: number;
  }) {
    return await prisma.credential.findFirst({
      where: {
        userId,
        appId,
      },
      include: {
        app: true,
      },
    });
  }

  static async findPaymentCredentialByAppIdAndUserIdOrTeamId({
    appId,
    userId,
    teamId,
  }: {
    appId: string | null;
    userId: number;
    teamId?: number | null;
  }) {
    const idToSearchObject = teamId ? { teamId } : { userId };
    return await prisma.credential.findFirst({
      where: {
        ...idToSearchObject,
        appId,
      },
      include: {
        app: true,
      },
    });
  }

  findByTeamIdAndSlugs({ teamId, slugs }: { teamId: number; slugs: string[] }) {
    return this.prismaClient.credential.findMany({
      where: {
        teamId,
        appId: {
          in: slugs,
        },
      },
      select: { ...safeCredentialSelect, team: { select: { name: true } } },
    });
  }

  findByIdAndTeamId({ id, teamId }: { id: number; teamId: number }) {
    return this.prismaClient.credential.findFirst({
      where: {
        id,
        teamId,
      },
      select: {
        ...safeCredentialSelect,
        app: {
          select: {
            slug: true,
          },
        },
      },
    });
  }

  async findByAppIdAndKeyValue({
    appId,
    keyPath,
    value,
    keyFields,
  }: {
    appId: string;
    keyPath: string[];
    value: Prisma.InputJsonValue;
    keyFields?: string[];
  }) {
    const credential = await this.prismaClient.credential.findFirst({
      where: {
        appId,
        key: {
          path: keyPath,
          equals: value,
        },
      },
      select: {
        ...safeCredentialSelect,
        integrationAttributeSyncs: {
          select: {
            id: true,
            attributeSyncRule: {
              select: {
                id: true,
                rule: true,
              },
            },
            syncFieldMappings: {
              select: {
                id: true,
                integrationFieldName: true,
                attributeId: true,
                enabled: true,
              },
            },
          },
        },
        key: keyFields ? true : false,
      },
    });

    if (!credential || !keyFields) {
      return credential;
    }

    const key = credential.key as Record<string, unknown>;
    const filteredKey = keyFields.reduce(
      (acc, field) => {
        if (field in key) {
          acc[field] = key[field];
        }
        return acc;
      },
      {} as Record<string, unknown>
    );

    return { ...credential, key: filteredKey };
  }
}
