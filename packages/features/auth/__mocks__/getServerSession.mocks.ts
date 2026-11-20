import type { PrismaClient } from "@calcom/prisma";
import type { User } from "@calcom/prisma/client";
import { IdentityProvider } from "@calcom/prisma/enums";
import type { Mock } from "vitest";
import { vi } from "vitest";
import { type DeepMockProxy, mockDeep, mockReset } from "vitest-mock-extended";

// Types
type LoggerInstance = {
  warn: Mock;
  error: Mock;
  debug: Mock;
};

type LoggerMock = {
  default: {
    getSubLogger: () => LoggerInstance;
  };
};

// JWT token structure used by NextAuth
interface MockToken {
  sub: string;
  email: string;
  name: string;
  exp: number;
  belongsToActiveTeam: boolean;
  org: null;
  orgAwareUsername: string | null;
  profileId: number | null;
  upId: string;
  impersonatedBy?: { id: number };
}

// Prisma mock instance
const prismaMock: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

function resetPrismaMock(): void {
  mockReset(prismaMock);
}

function createLoggerMock(): LoggerMock {
  const loggerInstance: LoggerInstance = {
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return {
    default: {
      getSubLogger: (): LoggerInstance => loggerInstance,
    },
  };
}

function createPrismaMock(): { default: DeepMockProxy<PrismaClient> } {
  return { default: prismaMock };
}

function createLicenseKeyMock(): {
  LicenseKeySingleton: { getInstance: Mock };
} {
  return {
    LicenseKeySingleton: {
      getInstance: vi.fn().mockResolvedValue({
        checkLicense: vi.fn().mockResolvedValue(false),
      }),
    },
  };
}

function createUserRepositoryMock(): {
  UserRepository: new (
    _prisma: PrismaClient
  ) => {
    enrichUserWithTheProfile: (params: { user: User }) => Promise<User & { profile: null }>;
  };
} {
  return {
    UserRepository: class MockUserRepository {
      enrichUserWithTheProfile({ user }: { user: User }): Promise<User & { profile: null }> {
        return Promise.resolve({
          ...user,
          profile: null,
        });
      }
    },
  };
}

function createAvatarUrlMock(): { getUserAvatarUrl: Mock } {
  return {
    getUserAvatarUrl: vi.fn().mockReturnValue("https://example.com/avatar.png"),
  };
}

function createSafeStringifyMock(): { safeStringify: Mock } {
  return {
    safeStringify: vi.fn().mockReturnValue("{}"),
  };
}

function createGetTokenMock(): { getToken: Mock } {
  return { getToken: vi.fn() };
}

// Creates a mock User with only the fields used by getServerSession
function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: 5,
    email: "user@example.com",
    name: "Test User",
    username: "testuser",
    emailVerified: new Date(),
    completedOnboarding: true,
    role: "USER",
    identityProvider: IdentityProvider.CAL,
    twoFactorEnabled: false,
    avatarUrl: null,
    locale: "en",
    ...overrides,
  } as User;
}

function createMockToken(overrides: Partial<MockToken> = {}): MockToken {
  return {
    sub: "5",
    email: "user@example.com",
    name: "Test User",
    exp: Math.floor(Date.now() / 1000) + 3600,
    belongsToActiveTeam: false,
    org: null,
    orgAwareUsername: null,
    profileId: null,
    upId: "usr-5",
    ...overrides,
  };
}

export type { MockToken };
export {
  prismaMock,
  resetPrismaMock,
  createLoggerMock,
  createPrismaMock,
  createLicenseKeyMock,
  createUserRepositoryMock,
  createAvatarUrlMock,
  createSafeStringifyMock,
  createGetTokenMock,
  createMockUser,
  createMockToken,
};
