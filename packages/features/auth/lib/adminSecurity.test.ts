import { IdentityProvider, UserPermissionRole } from "@calcom/prisma/enums";
import { isPasswordValid } from "@calcom/lib/auth/isPasswordValid";
import { describe, expect, it, vi } from "vitest";
import { getRoleWithAdminSecurityRequirements } from "./adminSecurity";

vi.mock("@calcom/lib/env", () => ({
  isENVDev: false,
  isENVE2E: false,
}));

describe("getRoleWithAdminSecurityRequirements", () => {
  const evaluate = (
    passwordMeetsRequirements: boolean,
    twoFactorEnabled: boolean
  ): ReturnType<typeof getRoleWithAdminSecurityRequirements> =>
    getRoleWithAdminSecurityRequirements({
      role: UserPermissionRole.ADMIN,
      identityProvider: IdentityProvider.CAL,
      passwordMeetsRequirements,
      twoFactorEnabled,
    });

  describe("strict admin password policy", () => {
    it.each([
      ["short password", "Short1", false],
      ["no uppercase letter", "abcdefghijklmn1", false],
      ["no lowercase letter", "ABCDEFGHIJKLMN1", false],
      ["no digit", "Abcdefghijklmn", false],
      ["all requirements", "Abcdefghijklmn1", true],
    ])("%s", (_description, password, expected) => {
      expect(isPasswordValid(password, false, true)).toBe(expected);
    });
  });

  it("marks an admin with a weak password and disabled 2FA inactive", () => {
    expect(evaluate(false, false)).toEqual({ role: "INACTIVE_ADMIN", inactiveAdminReason: "both" });
  });

  it("marks an admin with a strong password and disabled 2FA inactive", () => {
    expect(evaluate(true, false)).toEqual({ role: "INACTIVE_ADMIN", inactiveAdminReason: "2fa" });
  });

  it("marks an admin with a weak password and enabled 2FA inactive", () => {
    expect(evaluate(false, true)).toEqual({ role: "INACTIVE_ADMIN", inactiveAdminReason: "password" });
  });

  it("keeps an admin active when the password and 2FA requirements are met", () => {
    expect(evaluate(true, true)).toEqual({ role: UserPermissionRole.ADMIN });
  });

  it("does not change roles for non-admin or non-CAL users", () => {
    expect(
      getRoleWithAdminSecurityRequirements({
        role: UserPermissionRole.USER,
        identityProvider: IdentityProvider.CAL,
        passwordMeetsRequirements: false,
        twoFactorEnabled: false,
      })
    ).toEqual({ role: UserPermissionRole.USER });
    expect(
      getRoleWithAdminSecurityRequirements({
        role: UserPermissionRole.ADMIN,
        identityProvider: IdentityProvider.GOOGLE,
        passwordMeetsRequirements: false,
        twoFactorEnabled: false,
      })
    ).toEqual({ role: UserPermissionRole.ADMIN });
  });
});
