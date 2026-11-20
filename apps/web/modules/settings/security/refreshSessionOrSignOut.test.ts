import { signOut } from "next-auth/react";
import type { Session } from "next-auth";
import { describe, expect, it, vi } from "vitest";
import { refreshSessionOrSignOut } from "./refreshSessionOrSignOut";

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

describe("refreshSessionOrSignOut", () => {
  it("keeps the session when it refreshes successfully", async () => {
    const update = vi.fn<() => Promise<Session | null>>().mockResolvedValue({
      expires: "2099-01-01T00:00:00.000Z",
      hasValidLicense: true,
      upId: "usr_test",
      profileId: 1,
      user: {
        id: 1,
        uuid: "uuid_test",
        email: "admin@example.com",
        name: "Admin",
        username: "admin",
        role: "ADMIN",
      },
    });

    await refreshSessionOrSignOut(update);

    expect(update).toHaveBeenCalledOnce();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("signs out if the session cannot be refreshed", async () => {
    const update = vi.fn<() => Promise<Session | null>>().mockResolvedValue(null);

    await refreshSessionOrSignOut(update);

    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/auth/login" });
  });
});
