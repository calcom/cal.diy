import type { prisma } from "@calcom/prisma";
import type { AppCategories, Prisma } from "@calcom/prisma/client";
import { credentialForCalendarServiceSelect } from "@calcom/prisma/selects/credential";

export class PrismaCredentialRepository {
  constructor(private readonly prismaClient: typeof prisma) {}

  /**
   * Preserve delegation linkage so the user path can enrich delegated conferencing credentials.
   * Team and organization paths normalize these rows before enabled-app lookup.
   */
  async findNonDelegationCredentialsByAppCategories({
    idToSearchObject,
    appCategories,
  }: {
    idToSearchObject: Prisma.CredentialWhereInput;
    appCategories: AppCategories[];
  }) {
    const credentials = await this.prismaClient.credential.findMany({
      where: {
        ...idToSearchObject,
        app: {
          categories: {
            hasSome: appCategories,
          },
        },
      },
      select: {
        ...credentialForCalendarServiceSelect,
        team: {
          select: {
            name: true,
          },
        },
      },
    });

    return credentials;
  }
}