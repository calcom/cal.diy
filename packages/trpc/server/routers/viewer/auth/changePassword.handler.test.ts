import { IdentityProvider } from "@calcom/prisma/enums";
import { isPasswordValid } from "@calcom/lib/auth/isPasswordValid";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@calcom/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    userPassword: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@calcom/features/auth/lib/verifyPassword", () => ({
  verifyPassword: vi.fn(),
}));

vi.mock("@calcom/lib/auth/hashPassword", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed-new-password"),
}));

vi.mock("@calcom/lib/auth/isPasswordValid", () => ({
  isPasswordValid: vi.fn().mockReturnValue(true),
}));

vi.mock("@calcom/features/auth/lib/validPassword", () => ({
  validPassword: vi.fn().mockReturnValue(true),
}));

import { verifyPassword } from "@calcom/features/auth/lib/verifyPassword";
import { prisma } from "@calcom/prisma";
import { changePasswordHandler } from "./changePassword.handler";

describe("changePasswordHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const options = {
    ctx: {
      user: {
        id: 21,
        identityProvider: IdentityProvider.CAL,
      },
    },
    input: {
      oldPassword: "old-password",
      newPassword: "NewPassword123456!",
    },
  } as never;

  it("persists the server-calculated admin password status after a successful change", async () => {
    vi.mocked(prisma.userPassword.findUnique).mockResolvedValue({ hash: "old-hash", userId: 21 });
    vi.mocked(verifyPassword).mockResolvedValue(true);

    await changePasswordHandler(options);

    expect(prisma.userPassword.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 21 },
        create: expect.objectContaining({ adminPasswordMeetsRequirements: true }),
        update: expect.objectContaining({ adminPasswordMeetsRequirements: true }),
      })
    );
  });

  it("persists an unmet admin password policy after a successful weak password change", async () => {
    vi.mocked(prisma.userPassword.findUnique).mockResolvedValue({ hash: "old-hash", userId: 21 });
    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(isPasswordValid).mockReturnValue(false);

    await changePasswordHandler(options);

    expect(prisma.userPassword.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ adminPasswordMeetsRequirements: false }),
        update: expect.objectContaining({ adminPasswordMeetsRequirements: false }),
      })
    );
  });

  it("does not update password policy state when current-password verification fails", async () => {
    vi.mocked(prisma.userPassword.findUnique).mockResolvedValue({ hash: "old-hash", userId: 21 });
    vi.mocked(verifyPassword).mockResolvedValue(false);

    await expect(changePasswordHandler(options)).rejects.toThrow("incorrect_password");

    expect(prisma.userPassword.upsert).not.toHaveBeenCalled();
  });
});
