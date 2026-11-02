import { notFound, redirect } from "@tanstack/react-router";
import type { SessionUser } from "~/server/auth/session";

/**
 * Admin pages don't exist for anyone else; server functions check the role again. Production builds
 * also require two-factor authentication (as `adminMiddleware` does), so an admin without it is
 * sent to set it up instead of hitting a 403 that the root error page can only show as a crash.
 */
export function requireAdmin(
  context: { user: SessionUser | null },
  requireTwoFactor: boolean = import.meta.env.PROD
): void {
  if (!context.user?.isAdmin) throw notFound();
  if (requireTwoFactor && !context.user.twoFactorEnabled)
    throw redirect({ to: "/settings/security/two-factor-auth", search: { adminRequired: true } });
}
