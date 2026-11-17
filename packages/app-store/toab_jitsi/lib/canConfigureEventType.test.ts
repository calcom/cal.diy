import { HttpError } from "@calcom/lib/http-error";
import { beforeEach, describe, expect, test, vi } from "vitest";

const throwIfNotHaveAdminAccessToTeamMock: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());

vi.mock("@calcom/app-store/_utils/throwIfNotHaveAdminAccessToTeam", () => ({
  throwIfNotHaveAdminAccessToTeam: throwIfNotHaveAdminAccessToTeamMock,
}));

import { canConfigureEventType } from "./canConfigureEventType";

describe("canConfigureEventType", () => {
  beforeEach(() => {
    throwIfNotHaveAdminAccessToTeamMock.mockReset();
  });

  test("allows the owner of a personal event type", async () => {
    await expect(
      canConfigureEventType({ sessionUserId: 1, eventType: { userId: 1, teamId: null } })
    ).resolves.toBe(true);
    expect(throwIfNotHaveAdminAccessToTeamMock).not.toHaveBeenCalled();
  });

  test("denies another user on a personal event type", async () => {
    await expect(
      canConfigureEventType({ sessionUserId: 2, eventType: { userId: 1, teamId: null } })
    ).resolves.toBe(false);
  });

  test("allows a team admin", async () => {
    throwIfNotHaveAdminAccessToTeamMock.mockResolvedValue(undefined);
    await expect(
      canConfigureEventType({ sessionUserId: 2, eventType: { userId: null, teamId: 10 } })
    ).resolves.toBe(true);
    expect(throwIfNotHaveAdminAccessToTeamMock).toHaveBeenCalledWith({ teamId: 10, userId: 2 });
  });

  test("denies a non-admin team member instead of throwing", async () => {
    throwIfNotHaveAdminAccessToTeamMock.mockRejectedValue(
      new HttpError({ statusCode: 401, message: "You must be an admin of the team to do this" })
    );
    await expect(
      canConfigureEventType({ sessionUserId: 2, eventType: { userId: null, teamId: 10 } })
    ).resolves.toBe(false);
  });

  test("rethrows unexpected errors", async () => {
    const dbError = new Error("connection lost");
    throwIfNotHaveAdminAccessToTeamMock.mockRejectedValue(dbError);
    await expect(
      canConfigureEventType({ sessionUserId: 2, eventType: { userId: null, teamId: 10 } })
    ).rejects.toBe(dbError);
  });
});
