import { beforeEach, describe, it, expect, vi } from "vitest";

import { ErrorCode } from "@calcom/features/auth/lib/ErrorCode";
import { HttpError } from "@calcom/lib/http-error";
import { IdentityProvider } from "@calcom/prisma/enums";

const { mockFindUnique, mockVerifyPassword, mockDeleteUser } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockVerifyPassword: vi.fn(),
  mockDeleteUser: vi.fn(),
}));

vi.mock("@calcom/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

vi.mock("@calcom/features/auth/lib/verifyPassword", () => ({
  verifyPassword: (...args: unknown[]) => mockVerifyPassword(...args),
}));

vi.mock("@calcom/features/users/lib/deleteUser", () => ({
  deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
}));

vi.mock("@calcom/lib/crypto", () => ({
  symmetricDecrypt: vi.fn(),
}));

vi.mock("@calcom/lib/totp", () => ({
  totpAuthenticatorCheck: vi.fn(),
}));

import { deleteMeHandler } from "./deleteMe.handler";
import type { DeleteMeOptions } from "./deleteMe.handler";

const makeMockCtx = (role: "USER" | "ADMIN" | "INACTIVE_ADMIN" = "USER") =>
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
  twoFactorEnabled: false,
  twoFactorSecret: null,
  password: { hash: "$2a$12$storedLegacyHash" },
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
    });

    it("should throw error when password is only whitespace", async () => {
      await expect(
        deleteMeHandler({
          ctx: makeMockCtx(),
          input: { password: "   " },
        })
      ).rejects.toThrow(new HttpError({ statusCode: 400, message: ErrorCode.UserMissingPassword }));
    });
  });

  describe("Existing password verification (including legacy passwords)", () => {
    it("should allow ADMIN to delete account with a correct legacy password that fails strict policy", async () => {
      const mockUser = makeMockUser();
      mockFindUnique.mockResolvedValue(mockUser);
      mockVerifyPassword.mockResolvedValue(true);
      mockDeleteUser.mockResolvedValue(undefined);

      await deleteMeHandler({
        ctx: makeMockCtx("ADMIN"),
        input: { password: "short" },
      });

      expect(mockVerifyPassword).toHaveBeenCalledWith("short", mockUser.password.hash);
      expect(mockDeleteUser).toHaveBeenCalledWith(mockUser);
    });

    it("should allow INACTIVE_ADMIN to delete account with a correct legacy password", async () => {
      const mockUser = makeMockUser();
      mockFindUnique.mockResolvedValue(mockUser);
      mockVerifyPassword.mockResolvedValue(true);
      mockDeleteUser.mockResolvedValue(undefined);

      await deleteMeHandler({
        ctx: makeMockCtx("INACTIVE_ADMIN"),
        input: { password: "short" },
      });

      expect(mockVerifyPassword).toHaveBeenCalledWith("short", mockUser.password.hash);
      expect(mockDeleteUser).toHaveBeenCalledWith(mockUser);
    });

    it("should allow USER to delete account with a correct legacy password", async () => {
      const mockUser = makeMockUser();
      mockFindUnique.mockResolvedValue(mockUser);
      mockVerifyPassword.mockResolvedValue(true);
      mockDeleteUser.mockResolvedValue(undefined);

      await deleteMeHandler({
        ctx: makeMockCtx("USER"),
        input: { password: "weak" },
      });

      expect(mockVerifyPassword).toHaveBeenCalledWith("weak", mockUser.password.hash);
      expect(mockDeleteUser).toHaveBeenCalledWith(mockUser);
    });

    it("should throw IncorrectPassword when a legacy password does not match the stored hash", async () => {
      const mockUser = makeMockUser();
      mockFindUnique.mockResolvedValue(mockUser);
      mockVerifyPassword.mockResolvedValue(false);

      await expect(
        deleteMeHandler({
          ctx: makeMockCtx("ADMIN"),
          input: { password: "wrong" },
        })
      ).rejects.toThrow(new HttpError({ statusCode: 403, message: ErrorCode.IncorrectPassword }));

      expect(mockVerifyPassword).toHaveBeenCalledWith("wrong", mockUser.password.hash);
      expect(mockDeleteUser).not.toHaveBeenCalled();
    });

    it("should still enforce 2FA verification when deleting an ADMIN account with a legacy password", async () => {
      const mockUser = makeMockUser({ twoFactorEnabled: true, twoFactorSecret: "encrypted" });
      mockFindUnique.mockResolvedValue(mockUser);
      mockVerifyPassword.mockResolvedValue(true);

      await expect(
        deleteMeHandler({
          ctx: makeMockCtx("ADMIN"),
          input: { password: "short" },
        })
      ).rejects.toThrow(new HttpError({ statusCode: 400, message: ErrorCode.SecondFactorRequired }));

      expect(mockVerifyPassword).toHaveBeenCalledWith("short", mockUser.password.hash);
      expect(mockDeleteUser).not.toHaveBeenCalled();
    });
  });
});