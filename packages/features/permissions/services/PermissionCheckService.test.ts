import { describe, expect, it } from "vitest";

import { MembershipRole } from "@calcom/prisma/enums";

import type { PrismaPermissionMembershipRepository } from "../repositories/PrismaPermissionMembershipRepository";
import { PermissionCheckService } from "./PermissionCheckService";

type Membership = { userId: number; teamId: number; role: MembershipRole; accepted: boolean };

// Team 1 is a parent of team 2. Team 3 is unrelated.
const teams = [
  { id: 1, parentId: null },
  { id: 2, parentId: 1 },
  { id: 3, parentId: null },
];
const memberships: Membership[] = [
  { userId: 10, teamId: 2, role: MembershipRole.OWNER, accepted: true },
  { userId: 11, teamId: 2, role: MembershipRole.ADMIN, accepted: true },
  { userId: 12, teamId: 2, role: MembershipRole.MEMBER, accepted: true },
  { userId: 13, teamId: 2, role: MembershipRole.ADMIN, accepted: false },
  { userId: 14, teamId: 1, role: MembershipRole.ADMIN, accepted: true },
  { userId: 15, teamId: 1, role: MembershipRole.MEMBER, accepted: true },
  { userId: 16, teamId: 3, role: MembershipRole.OWNER, accepted: true },
];

const fakeRepository = {
  findParentTeamId: async (teamId: number) => teams.find((t) => t.id === teamId)?.parentId ?? null,
  hasAcceptedMembershipWithRole: async ({ userId, teamIds, roles }) =>
    memberships.some(
      (m) => m.userId === userId && teamIds.includes(m.teamId) && m.accepted && roles.includes(m.role)
    ),
  findTeamIdsWithAcceptedRole: async ({ userId, roles }) =>
    memberships.filter((m) => m.userId === userId && m.accepted && roles.includes(m.role)).map((m) => m.teamId),
  findChildTeamIds: async (parentIds: number[]) =>
    teams.filter((t) => t.parentId !== null && parentIds.includes(t.parentId)).map((t) => t.id),
} as PrismaPermissionMembershipRepository;

const service = new PermissionCheckService(fakeRepository);
const ADMIN_ROLES = [MembershipRole.ADMIN, MembershipRole.OWNER];
const ALL_ROLES = [MembershipRole.MEMBER, MembershipRole.ADMIN, MembershipRole.OWNER];

const check = (userId: number, teamId: number | null, fallbackRoles = ADMIN_ROLES) =>
  service.checkPermission({ userId, teamId, permission: "booking.readTeamBookings", fallbackRoles });

describe("PermissionCheckService.checkPermission", () => {
  it("allows team OWNER and ADMIN for admin-level permissions", async () => {
    expect(await check(10, 2)).toBe(true);
    expect(await check(11, 2)).toBe(true);
  });

  it("refuses a plain MEMBER for admin-level permissions but allows it when MEMBER is a fallback role", async () => {
    expect(await check(12, 2)).toBe(false);
    expect(await check(12, 2, ALL_ROLES)).toBe(true);
  });

  it("refuses a pending (not accepted) invite", async () => {
    expect(await check(13, 2)).toBe(false);
  });

  it("refuses users of another team and users in no team", async () => {
    expect(await check(16, 2)).toBe(false);
    expect(await check(99, 2)).toBe(false);
  });

  it("lets a parent-team ADMIN act on the sub-team, but not a parent-team MEMBER", async () => {
    expect(await check(14, 2)).toBe(true);
    expect(await check(15, 2, ALL_ROLES)).toBe(false);
  });

  it("does not pass sub-team rights up to the parent", async () => {
    expect(await check(10, 1)).toBe(false);
  });

  it("refuses when there is no team or no fallback roles", async () => {
    expect(await check(10, null)).toBe(false);
    expect(await check(10, 2, [])).toBe(false);
    expect(await service.checkPermission({ userId: 10, teamId: 2, permission: "x" })).toBe(false);
  });

  it("accepts roles given as plain strings", async () => {
    expect(await check(10, 2, ["OWNER"] as unknown as MembershipRole[])).toBe(true);
  });

  it("hasPermission gives the same answer as checkPermission", async () => {
    expect(await service.hasPermission({ userId: 11, teamId: 2, fallbackRoles: ADMIN_ROLES })).toBe(true);
    expect(await service.hasPermission({ userId: 12, teamId: 2, fallbackRoles: ADMIN_ROLES })).toBe(false);
  });
});

describe("PermissionCheckService.getTeamIdsWithPermission", () => {
  const teamIds = (userId: number, fallbackRoles = ADMIN_ROLES) =>
    service.getTeamIdsWithPermission({ userId, permission: "booking.read", fallbackRoles });

  it("returns the teams a user administers", async () => {
    expect(await teamIds(10)).toEqual([2]);
    expect(await teamIds(16)).toEqual([3]);
  });

  it("returns nothing for a plain member, a pending invite or a user in no team", async () => {
    expect(await teamIds(12)).toEqual([]);
    expect(await teamIds(13)).toEqual([]);
    expect(await teamIds(99)).toEqual([]);
  });

  it("includes sub-teams of a parent team the user administers", async () => {
    expect((await teamIds(14)).sort()).toEqual([1, 2]);
  });

  it("gives a parent-team MEMBER only the parent team, never its sub-teams", async () => {
    expect(await teamIds(15, ALL_ROLES)).toEqual([1]);
  });

  it("returns nothing without fallback roles", async () => {
    expect(await teamIds(10, [])).toEqual([]);
  });
});
