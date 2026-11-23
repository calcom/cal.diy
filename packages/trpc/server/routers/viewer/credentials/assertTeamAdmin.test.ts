import { prisma } from "@calcom/prisma/__mocks__/prisma";

import { describe, expect, it, vi } from "vitest";

import { MembershipRole } from "@calcom/prisma/enums";

import { assertTeamAdminPermission } from "./assertTeamAdmin";

vi.mock("@calcom/prisma", () => ({
  prisma,
}));

describe("assertTeamAdminPermission", () => {
  it("allows an accepted team admin (CVE-2026-109143)", async () => {
    prisma.membership.findFirst.mockResolvedValue({ id: 100 });
    await expect(assertTeamAdminPermission({ userId: 1, teamId: 5 })).resolves.toBeUndefined();
    expect(prisma.membership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          teamId: 5,
          userId: 1,
          accepted: true,
          role: { in: [MembershipRole.ADMIN, MembershipRole.OWNER] },
        },
      })
    );
  });

  it("rejects a user without accepted ADMIN/OWNER membership in the team (CVE-2026-109143)", async () => {
    prisma.membership.findFirst.mockResolvedValue(null);
    await expect(assertTeamAdminPermission({ userId: 1, teamId: 5 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("skips the check when no teamId is provided (personal credentials)", async () => {
    prisma.membership.findFirst.mockClear();
    await expect(assertTeamAdminPermission({ userId: 1 })).resolves.toBeUndefined();
    expect(prisma.membership.findFirst).not.toHaveBeenCalled();
  });
});
