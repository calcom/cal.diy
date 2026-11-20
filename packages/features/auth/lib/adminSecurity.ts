import { isENVDev, isENVE2E } from "@calcom/lib/env";
import { IdentityProvider, UserPermissionRole } from "@calcom/prisma/enums";

export type InactiveAdminReason = "both" | "password" | "2fa";

export function getRoleWithAdminSecurityRequirements({
  role,
  identityProvider,
  passwordMeetsRequirements,
  twoFactorEnabled,
}: {
  role: UserPermissionRole;
  identityProvider: IdentityProvider;
  passwordMeetsRequirements: boolean;
  twoFactorEnabled: boolean;
}): { role: UserPermissionRole | "INACTIVE_ADMIN"; inactiveAdminReason?: InactiveAdminReason } {
  if (
    role !== UserPermissionRole.ADMIN ||
    identityProvider !== IdentityProvider.CAL ||
    isENVE2E ||
    isENVDev
  ) {
    return { role };
  }

  if (passwordMeetsRequirements && twoFactorEnabled) {
    return { role };
  }

  let inactiveAdminReason: InactiveAdminReason;
  if (!passwordMeetsRequirements && !twoFactorEnabled) {
    inactiveAdminReason = "both";
  } else if (!passwordMeetsRequirements) {
    inactiveAdminReason = "password";
  } else {
    inactiveAdminReason = "2fa";
  }

  return { role: "INACTIVE_ADMIN", inactiveAdminReason };
}
