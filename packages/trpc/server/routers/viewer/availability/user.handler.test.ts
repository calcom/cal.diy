import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcSessionUser } from "../../../types";
import { userHandler } from "./user.handler";
import type { TUserInputSchema } from "./user.schema";

const { findUsersForAvailabilityCheckMock, getUserAvailabilityMock } = vi.hoisted(() => ({
  findUsersForAvailabilityCheckMock: vi.fn(),
  getUserAvailabilityMock: vi.fn(),
}));

vi.mock("@calcom/features/availability/lib/findUsersForAvailabilityCheck", () => ({
  findUsersForAvailabilityCheck: findUsersForAvailabilityCheckMock,
}));
vi.mock("@calcom/features/di/containers/GetUserAvailability", () => ({
  getUserAvailabilityService: () => ({
    getUserAvailabilityIncludingBusyTimesFromLimits: getUserAvailabilityMock,
  }),
}));

const input = { username: "pro" } as TUserInputSchema;
const ctx = { user: { id: 1 } as NonNullable<TrpcSessionUser> };

describe("availability.user handler", () => {
  beforeEach(() => {
    findUsersForAvailabilityCheckMock.mockReset();
    getUserAvailabilityMock.mockReset();
  });

  it("includes calendar event titles when the user looks at their own availability", async () => {
    findUsersForAvailabilityCheckMock.mockResolvedValue({ id: 1 });

    await userHandler({ ctx, input });

    expect(getUserAvailabilityMock.mock.calls[0][0]).toMatchObject({ username: "pro", mode: "overlay" });
  });

  it("doesn't include calendar event titles of another user, even with the same username", async () => {
    findUsersForAvailabilityCheckMock.mockResolvedValue({ id: 2 });

    await userHandler({ ctx, input });

    expect(getUserAvailabilityMock.mock.calls[0][0]).not.toHaveProperty("mode");
  });

  it("throws when the user doesn't exist", async () => {
    findUsersForAvailabilityCheckMock.mockResolvedValue(null);

    await expect(userHandler({ ctx, input })).rejects.toThrow("User not found");
  });
});
