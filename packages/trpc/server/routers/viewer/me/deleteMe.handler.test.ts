import { ErrorCode } from "@calcom/features/auth/lib/ErrorCode";
import { HttpError } from "@calcom/lib/http-error";
import { IdentityProvider, UserPermissionRole } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeleteMeOptions } from "./deleteMe.handler";
import { deleteMeHandler } from "./deleteMe.handler";

const {
  mockFindUnique,
  mockVerifyPassword,
  mockDeleteUser,
  mockSymmetricDecrypt,
  mockTotpAuthenticatorCheck,
} = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockVerifyPassword: vi.fn(),
  mockDeleteUser: vi.fn(),
  mockSymmetricDecrypt: vi.fn(),
  mockTotpAuthenticatorCheck: vi.fn(),
}));

vi.mock("@calcom/prisma", () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
    },
  },
}));

vi.mock("@calcom/features/auth/lib/verifyPassword", () => ({
  verifyPassword: mockVerifyPassword,
}));

vi.mock("@calcom/features/users/lib/deleteUser", () => ({
  deleteUser: mockDeleteUser,
}));

vi.mock("@calcom/lib/crypto", () => ({
  symmetricDecrypt: mockSymmetricDecrypt,
}));

vi.mock("@calcom/lib/totp", () => ({
  totpAuthenticatorCheck: mockTotpAuthenticatorCheck,
}));

const makeMockCtx = (role: UserPermissionRole = UserPermissionRole.USER) =>
  ({
    user: {
      id: 123,
      name: "Test User",
      email: "test@example.com",
      role,
    },
  }) as DeleteMeOptions["ctx"];

const makeMockUser = (overrides: Record<string, unknown> = {}) => ({
  id: 123,
  email: "test@example.com",
  identityProvider: IdentityProvider.CAL,
  password: { hash: "$2b$10$storedhash" },
  twoFactorEnabled: false,
  twoFactorSecret: null,
  metadata: null,
  ...overrides,
});

describe("deleteMeHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Password presence validation", () => {
    it("should throw error when password is empty", async () => {
      await expect(
        deleteMeHandler({
          ctx: makeMockCtx(),
          input: { password: "" },
        })
      ).rejects.toThrow(new HttpError({ statusCode: 400, message: ErrorCode.UserMissingPassword }));

      expect(mockFindUnique).not.toHaveBeenCalled();
    });

    it("should throw error when password is only whitespace", async () => {
      await expect(
        deleteMeHandler({
          ctx: makeMockCtx(),
          input: { password: "   " },
        })
      ).rejects.toThrow(new HttpError({ statusCode: 400, message: ErrorCode.UserMissingPassword }));

      expect(mockFindUnique).not.toHaveBeenCalled();
    });
  });

  describe("Existing password verification without password-creation policy blocking", () => {
    it("allows ADMIN to delete account with a correct legacy password that fails strict policy", async () => {
      const storedUser = makeMockUser();
      mockFindUnique.mockResolvedValue(storedUser);
      mockVerifyPassword.mockResolvedValue(true);
      mockDeleteUser.mockResolvedValue(undefined);

      await expect(
        deleteMeHandler({
          ctx: makeMockCtx(UserPermissionRole.ADMIN),
          input: { password: "weak" },
        })
      ).resolves.toBeUndefined();

      expect(mockVerifyPassword).toHaveBeenCalledWith("weak", storedUser.password.hash);
      expect(mockDeleteUser).toHaveBeenCalledWith(storedUser);
    });

    it("allows INACTIVE_ADMIN to delete account with a correct legacy password that fails strict policy", async () => {
      const storedUser = makeMockUser();
      mockFindUnique.mockResolvedValue(storedUser);
      mockVerifyPassword.mockResolvedValue(true);
      mockDeleteUser.mockResolvedValue(undefined);

      await expect(
        deleteMeHandler({
          ctx: makeMockCtx(UserPermissionRole.INACTIVE_ADMIN),
          input: { password: "short12" },
        })
      ).resolves.toBeUndefined();

      expect(mockVerifyPassword).toHaveBeenCalledWith("short12", storedUser.password.hash);
      expect(mockDeleteUser).toHaveBeenCalledWith(storedUser);
    });

    it("allows USER to delete account with a correct legacy password", async () => {
      const storedUser = makeMockUser();
      mockFindUnique.mockResolvedValue(storedUser);
      mockVerifyPassword.mockResolvedValue(true);
      mockDeleteUser.mockResolvedValue(undefined);

      await expect(
        deleteMeHandler({
          ctx: makeMockCtx(UserPermissionRole.USER),
          input: { password: "weak" },
        })
      ).resolves.toBeUndefined();

      expect(mockVerifyPassword).toHaveBeenCalledWith("weak", storedUser.password.hash);
      expect(mockDeleteUser).toHaveBeenCalledWith(storedUser);
    });

    it("throws IncorrectPassword instead of PasswordPolicyViolation when a weak password does not match", async () => {
      const storedUser = makeMockUser();
      mockFindUnique.mockResolvedValue(storedUser);
      mockVerifyPassword.mockResolvedValue(false);

      await expect(
        deleteMeHandler({
          ctx: makeMockCtx(UserPermissionRole.ADMIN),
          input: { password: "weak" },
        })
      ).rejects.toThrow(new HttpError({ statusCode: 403, message: ErrorCode.IncorrectPassword }));

      expect(mockDeleteUser).not.toHaveBeenCalled();
    });

    it("still enforces 2FA when enabled for an admin using a legacy password", async () => {
      const storedUser = makeMockUser({
        twoFactorEnabled: true,
        twoFactorSecret: "encrypted-secret",
      });
      mockFindUnique.mockResolvedValue(storedUser);
      mockVerifyPassword.mockResolvedValue(true);

      await expect(
        deleteMeHandler({
          ctx: makeMockCtx(UserPermissionRole.ADMIN),
          input: { password: "weak" },
        })
      ).rejects.toThrow(new HttpError({ statusCode: 400, message: ErrorCode.SecondFactorRequired }));

      expect(mockDeleteUser).not.toHaveBeenCalled();
    });
  });
});
