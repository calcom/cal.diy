import type { NextApiRequest } from "next";
import type { RequestMethod } from "node-mocks-http";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Use vi.hoisted to import mocks before vi.mock hoisting
const {
  prismaMock,
  resetPrismaMock,
  createLoggerMock,
  createPrismaMock,
  createUserRepositoryMock,
  createAvatarUrlMock,
  createSafeStringifyMock,
  createGetTokenMock,
  createMockUser,
  createMockToken,
}: typeof import("../__mocks__/getServerSession.mocks") = await vi.hoisted(
  async () => await import("../__mocks__/getServerSession.mocks")
);

vi.mock("@calcom/lib/logger", createLoggerMock);
vi.mock("@calcom/prisma", createPrismaMock);
vi.mock("@calcom/features/users/repositories/UserRepository", createUserRepositoryMock);
vi.mock("@calcom/lib/getAvatarUrl", createAvatarUrlMock);
vi.mock("@calcom/lib/safeStringify", createSafeStringifyMock);
vi.mock("next-auth/jwt", createGetTokenMock);

import { getToken } from "next-auth/jwt";
import { IdentityProvider } from "@calcom/prisma/enums";
import { getServerSession } from "./getServerSession";

type MockNextApiRequest = ReturnType<typeof createMocks<NextApiRequest>>["req"];

function createMockRequest(method: RequestMethod = "GET"): MockNextApiRequest {
  const { req } = createMocks<NextApiRequest>({ method });
  return req;
}

function setupGetTokenMock(tokenData: object | null): void {
  vi.mocked(getToken).mockResolvedValue(tokenData as Record<string, unknown> | null);
}

describe("getServerSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPrismaMock();
  });

  describe("Token Validation", () => {
    it.each([
      ["no token", null],
      ["no email", { sub: "5" }],
      ["no sub", { email: "user@example.com" }],
    ])("returns null when token is invalid: %s", async (_, token) => {
      setupGetTokenMock(token);

      const result = await getServerSession({ req: createMockRequest() });
      expect(result).toBeNull();
    });
  });

  describe("User ID Validation", () => {
    it.each(["", "invalid", "0", "-1"])("returns null when token.sub is invalid (%s)", async (sub) => {
      setupGetTokenMock(createMockToken({ sub }));

      const result = await getServerSession({ req: createMockRequest() });

      expect(result).toBeNull();
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("User Lookup", () => {
    it("looks up user by ID from token.sub", async () => {
      const mockUser = createMockUser({ id: 123 });
      setupGetTokenMock(createMockToken({ sub: "123" }));
      prismaMock.user.findUnique.mockResolvedValue(mockUser);

      await getServerSession({ req: createMockRequest() });

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: 123 },
        include: {
          password: {
            select: {
              adminPasswordMeetsRequirements: true,
            },
          },
        },
      });
    });

    it("returns null when user not found in database", async () => {
      setupGetTokenMock(createMockToken({ sub: "999" }));
      prismaMock.user.findUnique.mockResolvedValue(null);

      const result = await getServerSession({ req: createMockRequest() });
      expect(result).toBeNull();
    });

    it("returns session with correct user data", async () => {
      const mockUser = createMockUser();
      setupGetTokenMock(createMockToken());
      prismaMock.user.findUnique.mockResolvedValue(mockUser);

      const result = await getServerSession({ req: createMockRequest() });

      expect(result).toMatchObject({
        user: {
          id: mockUser.id,
          email: mockUser.email,
        },
      });
    });
  });

  describe("User Resolution", () => {
    it("resolves user by token subject ID", async () => {
      const token = createMockToken({
        sub: "999",
        email: "user@example.com",
      });

      setupGetTokenMock(token);
      prismaMock.user.findUnique.mockResolvedValue(null);

      await getServerSession({ req: createMockRequest() });

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: 999 },
        include: {
          password: {
            select: {
              adminPasswordMeetsRequirements: true,
            },
          },
        },
      });
    });

    it("returns user data from database lookup", async () => {
      const dbUser = createMockUser({ id: 999, email: "db-user@example.com" });
      const token = createMockToken({
        sub: "999",
        email: "token-email@example.com",
      });

      setupGetTokenMock(token);
      prismaMock.user.findUnique.mockResolvedValue(dbUser);

      const result = await getServerSession({ req: createMockRequest() });

      expect(result).toMatchObject({
        user: {
          id: 999,
          email: "db-user@example.com",
        },
      });
    });

    it("uses ID field for database queries", async () => {
      const mockUser = createMockUser();
      setupGetTokenMock(createMockToken());
      prismaMock.user.findUnique.mockResolvedValue(mockUser);

      await getServerSession({ req: createMockRequest() });

      const calls = prismaMock.user.findUnique.mock.calls;
      for (const call of calls) {
        const whereClause = call[0]?.where as Record<string, unknown>;
        expect(whereClause).toHaveProperty("id");
        expect(whereClause).not.toHaveProperty("email");
      }
    });
  });

  it("refreshes cached admin roles using current password and 2FA status from the database", async () => {
    const token = createMockToken({ sub: "730" });
    setupGetTokenMock(token);
    prismaMock.user.findUnique
      .mockResolvedValueOnce({
        ...createMockUser({
          id: 730,
          role: "ADMIN",
          identityProvider: IdentityProvider.CAL,
          twoFactorEnabled: false,
        }),
        password: { adminPasswordMeetsRequirements: true },
      } as never)
      .mockResolvedValueOnce({
        ...createMockUser({
          id: 730,
          role: "ADMIN",
          identityProvider: IdentityProvider.CAL,
          twoFactorEnabled: true,
        }),
        password: { adminPasswordMeetsRequirements: true },
      } as never);

    const firstSession = await getServerSession({ req: createMockRequest() });
    const secondSession = await getServerSession({ req: createMockRequest() });

    expect(firstSession?.user.role).toBe("INACTIVE_ADMIN");
    expect(secondSession?.user.role).toBe("ADMIN");
    expect(secondSession?.user.inactiveAdminReason).toBeUndefined();
  });

  it("restricts cached admin privileges after 2FA is disabled", async () => {
    const token = createMockToken({ sub: "731" });
    setupGetTokenMock(token);
    prismaMock.user.findUnique
      .mockResolvedValueOnce({
        ...createMockUser({
          id: 731,
          role: "ADMIN",
          identityProvider: IdentityProvider.CAL,
          twoFactorEnabled: true,
        }),
        password: { adminPasswordMeetsRequirements: true },
      } as never)
      .mockResolvedValueOnce({
        ...createMockUser({
          id: 731,
          role: "ADMIN",
          identityProvider: IdentityProvider.CAL,
          twoFactorEnabled: false,
        }),
        password: { adminPasswordMeetsRequirements: true },
      } as never);

    const activeSession = await getServerSession({ req: createMockRequest() });
    const inactiveSession = await getServerSession({ req: createMockRequest() });

    expect(activeSession?.user.role).toBe("ADMIN");
    expect(inactiveSession?.user.role).toBe("INACTIVE_ADMIN");
    expect(inactiveSession?.user.inactiveAdminReason).toBe("2fa");
  });
});
