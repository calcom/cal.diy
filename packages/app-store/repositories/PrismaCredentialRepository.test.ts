import prismaMock from "@calcom/testing/lib/__mocks__/prismaMock";
import { credentialForCalendarServiceSelect } from "@calcom/prisma/selects/credential";
import { describe, expect, it } from "vitest";
import { PrismaCredentialRepository } from "./PrismaCredentialRepository";

const storedCredential = {
  id: 1,
  type: "google_video",
  key: {},
  encryptedKey: null,
  userId: 42,
  user: { email: "user@example.com" },
  teamId: null,
  appId: "google-meet",
  invalid: false,
  delegationCredentialId: "delegation-credential-1",
  team: null,
};

describe("PrismaCredentialRepository", () => {
  describe("findNonDelegationCredentialsByAppCategories", () => {
    it("queries Prisma with the given id search object, app categories and select shape", async () => {
      prismaMock.credential.findMany.mockResolvedValue([storedCredential]);

      const repository = new PrismaCredentialRepository(prismaMock);
      await repository.findNonDelegationCredentialsByAppCategories({
        idToSearchObject: { userId: 42 },
        appCategories: ["conferencing"],
      });

      expect(prismaMock.credential.findMany).toHaveBeenCalledWith({
        where: {
          userId: 42,
          app: {
            categories: {
              hasSome: ["conferencing"],
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
    });

    it("returns rows as stored, preserving delegation linkage fields", async () => {
      prismaMock.credential.findMany.mockResolvedValue([storedCredential]);

      const repository = new PrismaCredentialRepository(prismaMock);
      const result = await repository.findNonDelegationCredentialsByAppCategories({
        idToSearchObject: { userId: 42 },
        appCategories: ["conferencing"],
      });

      expect(result).toEqual([storedCredential]);
      expect(result[0].delegationCredentialId).toBe("delegation-credential-1");
    });
  });
});
