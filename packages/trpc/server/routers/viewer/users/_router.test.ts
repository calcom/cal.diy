import { describe, expect, it, vi } from "vitest";

const { mockListUsers } = vi.hoisted(() => ({ mockListUsers: vi.fn() }));

vi.mock("@calcom/features/auth/lib/userFromSessionUtils", () => ({
  getUserSession: vi.fn(async (ctx: { session?: unknown; user?: unknown }) => ({
    session: ctx.session,
    user: ctx.user,
  })),
}));

vi.mock("@calcom/features/di/containers/UserRepository", () => ({
  getUserRepository: () => ({ listUsers: mockListUsers }),
}));

import { userAdminRouter } from "./_router";

const caller = userAdminRouter.createCaller({
  session: { user: { id: "1" } },
  user: { id: 1, role: "ADMIN" },
} as never);

describe("userAdminRouter.list", () => {
  it("uses the default pagination values", async () => {
    mockListUsers.mockResolvedValue({ nextCursor: undefined, total: 0, users: [] });

    await expect(caller.list()).resolves.toEqual({
      meta: { totalRowCount: 0 },
      nextCursor: undefined,
      rows: [],
    });
    expect(mockListUsers).toHaveBeenCalledWith({ cursor: null, limit: 50 });
  });

  it("passes search and cursor pagination to the repository", async () => {
    const users = [{ email: "alex@example.com", id: 42 }];
    mockListUsers.mockResolvedValue({ nextCursor: 42, total: 101, users });

    await expect(caller.list({ cursor: 10, limit: 25, searchTerm: "  alex  " })).resolves.toEqual({
      meta: { totalRowCount: 101 },
      nextCursor: 42,
      rows: users,
    });
    expect(mockListUsers).toHaveBeenCalledWith({ cursor: 10, limit: 25, searchTerm: "alex" });
  });
});
