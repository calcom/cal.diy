import { beforeEach, describe, expect, it, vi } from "vitest";

import { MembershipRole, SchedulingType } from "@calcom/prisma/enums";

import { createHandler } from "./create.handler";

const mockCheckPermission = vi.fn();
vi.mock("@calcom/features/permissions/services/PermissionCheckService", () => ({
  PermissionCheckService: class {
    checkPermission(...args: unknown[]): unknown {
      return mockCheckPermission(...args);
    }
  },
}));

const mockCreate = vi.fn();
vi.mock("@calcom/features/eventtypes/repositories/eventTypeRepository", () => ({
  EventTypeRepository: class {
    create(...args: unknown[]): unknown {
      return mockCreate(...args);
    }
  },
}));

vi.mock("@calcom/app-store/_utils/getDefaultLocations", () => ({
  getDefaultLocations: vi.fn().mockResolvedValue([]),
}));

const ORG_ID = 50;
const TEAM_IN_ORG = 51;
const TEAM_IN_OTHER_ORG = 61;
const teams: Record<number, { parentId: number | null }> = {
  [TEAM_IN_ORG]: { parentId: ORG_ID },
  [TEAM_IN_OTHER_ORG]: { parentId: 60 },
};

const prisma = {
  team: {
    findUnique: vi.fn(async ({ where }: { where: { id: number } }) => teams[where.id] ?? null),
  },
  organizationSettings: { findUnique: vi.fn().mockResolvedValue(null) },
};

const buildCtx = (organizationId: number | null) =>
  ({
    user: {
      id: 1,
      role: "USER",
      organizationId,
      organization: { isOrgAdmin: false },
      profile: { id: 1 },
      metadata: {},
      email: "user@example.com",
    },
    prisma,
  }) as unknown as Parameters<typeof createHandler>[0]["ctx"];

const teamInput = (teamId: number) =>
  ({
    title: "Team event",
    slug: "team-event",
    length: 30,
    teamId,
    schedulingType: SchedulingType.COLLECTIVE,
  }) as Parameters<typeof createHandler>[0]["input"];

/** Answers checkPermission per team: `orgAdmin` for the org team, `teamAdmin` for everything else. */
const permissions = ({ orgAdmin, teamAdmin }: { orgAdmin: boolean; teamAdmin: boolean }) =>
  mockCheckPermission.mockImplementation(async ({ teamId }: { teamId: number }) =>
    teamId === ORG_ID ? orgAdmin : teamAdmin
  );

describe("createHandler team permission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({ id: 1 });
  });

  it("lets an organization admin create an event type on a team inside their organization", async () => {
    permissions({ orgAdmin: true, teamAdmin: false });

    await expect(createHandler({ ctx: buildCtx(ORG_ID), input: teamInput(TEAM_IN_ORG) })).resolves.toEqual({
      eventType: { id: 1 },
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ team: { connect: { id: TEAM_IN_ORG } } })
    );
  });

  it("refuses an organization admin on a team that belongs to another organization", async () => {
    permissions({ orgAdmin: true, teamAdmin: false });

    await expect(
      createHandler({ ctx: buildCtx(ORG_ID), input: teamInput(TEAM_IN_OTHER_ORG) })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("lets a team admin create an event type on their team regardless of organization", async () => {
    permissions({ orgAdmin: false, teamAdmin: true });

    await expect(
      createHandler({ ctx: buildCtx(null), input: teamInput(TEAM_IN_OTHER_ORG) })
    ).resolves.toEqual({ eventType: { id: 1 } });
    expect(mockCheckPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: TEAM_IN_OTHER_ORG,
        permission: "eventType.create",
        fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
      })
    );
  });

  it("refuses a user with no permission on the team and no organization", async () => {
    permissions({ orgAdmin: false, teamAdmin: false });

    await expect(createHandler({ ctx: buildCtx(null), input: teamInput(TEAM_IN_ORG) })).rejects.toMatchObject(
      { code: "UNAUTHORIZED" }
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
