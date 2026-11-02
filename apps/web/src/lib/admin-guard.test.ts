import { isNotFound, isRedirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import type { SessionUser } from "~/server/auth/session";
import { requireAdmin } from "./admin-guard";

function sessionUser(overrides: Partial<SessionUser>): SessionUser {
  return {
    id: 1,
    email: "admin@example.com",
    name: null,
    username: "admin",
    timeZone: "UTC",
    hour12: undefined,
    weekStartDay: 0,
    appTheme: null,
    needsEmailVerification: false,
    isAdmin: true,
    twoFactorEnabled: true,
    impersonatedBy: null,
    completedOnboarding: true,
    ...overrides,
  };
}

function thrownBy(call: () => void): unknown {
  try {
    call();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("requireAdmin", () => {
  it("hides admin pages from signed-out users and non-admins", () => {
    expect(isNotFound(thrownBy(() => requireAdmin({ user: null }, true)))).toBe(true);
    expect(isNotFound(thrownBy(() => requireAdmin({ user: sessionUser({ isAdmin: false }) }, true)))).toBe(
      true
    );
  });

  it("sends an admin without two-factor authentication to set it up when it is required", () => {
    const error = thrownBy(() => requireAdmin({ user: sessionUser({ twoFactorEnabled: false }) }, true));
    expect(isRedirect(error)).toBe(true);
    expect(isRedirect(error) && error.options).toMatchObject({
      to: "/settings/security/two-factor-auth",
      search: { adminRequired: true },
    });
  });

  it("lets an admin through with two-factor authentication, or when it isn't required", () => {
    expect(() => requireAdmin({ user: sessionUser({}) }, true)).not.toThrow();
    expect(() => requireAdmin({ user: sessionUser({ twoFactorEnabled: false }) }, false)).not.toThrow();
  });
});
