import type { PrismaClient } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { authedProcedure } from "../../../procedures/authedProcedure";
import { createEventPbacProcedure, ensureEmailOrPhoneNumberIsPresent } from "../util";

const mockCheckPermission = vi.fn();
vi.mock("@calcom/features/permissions/services/PermissionCheckService", () => ({
  PermissionCheckService: class {
    checkPermission(...args: unknown[]): unknown {
      return mockCheckPermission(...args);
    }
  },
}));

describe("createEventPbacProcedure", () => {
  const mockPrisma = {
    eventType: {
      findUnique: vi.fn(),
    },
  } as unknown as PrismaClient;

  const mockCtx = {
    user: { id: 1, profile: { upId: "user-1" } },
    session: { user: { id: 1 } },
    prisma: mockPrisma,
  };

  const mockNext = vi.fn().mockResolvedValue({ ctx: mockCtx });

  // Helper to get the custom middleware (after authedProcedure)
  const getMiddleware = (procedure: ReturnType<typeof authedProcedure>) => {
    // The last middleware is our custom one
    return procedure._def.middlewares[procedure._def.middlewares.length - 1];
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckPermission.mockResolvedValue(true);
  });

  describe("personal events", () => {
    const personalEvent = {
      id: 1,
      userId: 1,
      teamId: null,
      users: [{ id: 1 }],
      team: null,
    };

    it("should allow owner to access their personal event", async () => {
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(personalEvent);

      const procedure = createEventPbacProcedure("eventType.update");
      const middleware = getMiddleware(procedure);

      await expect(
        middleware({
          ctx: mockCtx,
          input: { id: 1 },
          next: mockNext,
          path: "test",
          type: "mutation",
          getRawInput: async () => ({}),
          meta: undefined,
        })
      ).resolves.not.toThrow();
    });

    it("should allow assigned user to access personal event", async () => {
      mockPrisma.eventType.findUnique = vi
        .fn()
        .mockResolvedValue({ ...personalEvent, userId: 2, users: [{ id: 1 }, { id: 2 }] });

      const procedure = createEventPbacProcedure("eventType.update");
      const middleware = getMiddleware(procedure);

      await expect(
        middleware({
          ctx: mockCtx,
          input: { id: 1 },
          next: mockNext,
          path: "test",
          type: "mutation",
          getRawInput: async () => ({}),
          meta: undefined,
        })
      ).resolves.not.toThrow();
    });

    it("should deny non-owner/non-assigned user from accessing personal event", async () => {
      mockPrisma.eventType.findUnique = vi
        .fn()
        .mockResolvedValue({ ...personalEvent, userId: 2, users: [{ id: 2 }] });

      const procedure = createEventPbacProcedure("eventType.update");
      const middleware = getMiddleware(procedure);

      await expect(
        middleware({
          ctx: mockCtx,
          input: { id: 1 },
          next: mockNext,
          path: "test",
          type: "mutation",
          getRawInput: async () => ({}),
          meta: undefined,
        })
      ).rejects.toThrow(TRPCError);
    });

    it("should deny team member from accessing another user's personal event", async () => {
      // User 1 trying to access user 2's personal event
      mockPrisma.eventType.findUnique = vi
        .fn()
        .mockResolvedValue({ ...personalEvent, userId: 2, users: [{ id: 2 }] });

      const procedure = createEventPbacProcedure("eventType.update");
      const middleware = getMiddleware(procedure);

      const result = middleware({
        ctx: mockCtx,
        input: { id: 1 },
        next: mockNext,
        path: "test",
        type: "mutation",
        getRawInput: async () => ({}),
        meta: undefined,
      });

      await expect(result).rejects.toThrow(TRPCError);
      await expect(result).rejects.toThrow("Permission required: eventType.update");
    });

    it("should only allow assigning self to personal event", async () => {
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(personalEvent);

      const procedure = createEventPbacProcedure("eventType.update");
      const middleware = getMiddleware(procedure);

      await expect(
        middleware({
          ctx: mockCtx,
          input: { id: 1, users: [1] },
          next: mockNext,
          path: "test",
          type: "mutation",
          getRawInput: async () => ({}),
          meta: undefined,
        })
      ).resolves.not.toThrow();
    });

    it("should deny assigning other users to personal event", async () => {
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(personalEvent);

      const procedure = createEventPbacProcedure("eventType.update");
      const middleware = getMiddleware(procedure);

      const result = middleware({
        ctx: mockCtx,
        input: { id: 1, users: [1, 2] },
        next: mockNext,
        path: "test",
        type: "mutation",
        getRawInput: async () => ({}),
        meta: undefined,
      });

      await expect(result).rejects.toThrow(TRPCError);
      await expect(result).rejects.toThrow("Cannot assign event to users outside of team membership");
    });
  });

  describe("team events - with permission", () => {
    const teamEvent = {
      id: 2,
      userId: null,
      teamId: 10,
      users: [],
      team: {
        members: [{ userId: 1 }, { userId: 2 }, { userId: 3 }],
      },
    };

    it("should allow team member with permission to access team event", async () => {
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(teamEvent);

      const procedure = createEventPbacProcedure("eventType.update", [
        MembershipRole.ADMIN,
        MembershipRole.OWNER,
      ]);
      const middleware = getMiddleware(procedure);

      await expect(
        middleware({
          ctx: mockCtx,
          input: { id: 2 },
          next: mockNext,
          path: "test",
          type: "mutation",
          getRawInput: async () => ({}),
          meta: undefined,
        })
      ).resolves.not.toThrow();
    });

    it("should allow org admin without team membership to access team event", async () => {
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(teamEvent);

      const procedure = createEventPbacProcedure("eventType.update");
      const middleware = getMiddleware(procedure);

      // Whether an org admin may act on the team is PermissionCheckService's decision; here it allows.
      await expect(
        middleware({
          ctx: mockCtx,
          input: { id: 2 },
          next: mockNext,
          path: "test",
          type: "mutation",
          getRawInput: async () => ({}),
          meta: undefined,
        })
      ).resolves.not.toThrow();
    });
  });

  describe("team events - user assignment validation", () => {
    const teamEvent = {
      id: 2,
      userId: null,
      teamId: 10,
      users: [],
      team: {
        members: [{ userId: 1 }, { userId: 2 }, { userId: 3 }],
      },
    };

    it("should allow assigning team members to team event", async () => {
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(teamEvent);

      const procedure = createEventPbacProcedure("eventType.update");
      const middleware = getMiddleware(procedure);

      await expect(
        middleware({
          ctx: mockCtx,
          input: { id: 2, users: [1, 2, 3] },
          next: mockNext,
          path: "test",
          type: "mutation",
          getRawInput: async () => ({}),
          meta: undefined,
        })
      ).resolves.not.toThrow();
    });

    it("should deny assigning non-team members to team event", async () => {
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(teamEvent);

      const procedure = createEventPbacProcedure("eventType.update");
      const middleware = getMiddleware(procedure);

      const result = middleware({
        ctx: mockCtx,
        input: { id: 2, users: [1, 2, 999] },
        next: mockNext,
        path: "test",
        type: "mutation",
        getRawInput: async () => ({}),
        meta: undefined,
      });

      await expect(result).rejects.toThrow(TRPCError);
      await expect(result).rejects.toThrow("Cannot assign event to users outside of team membership");
    });

    it("should deny org admin from assigning org members who are not in the team", async () => {
      // Org admin (user 1) has permission but tries to assign org member (user 50) who's not in team
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(teamEvent);

      const procedure = createEventPbacProcedure("eventType.update");
      const middleware = getMiddleware(procedure);

      const result = middleware({
        ctx: mockCtx,
        input: { id: 2, users: [1, 50] }, // User 50 is an org member but not team member
        next: mockNext,
        path: "test",
        type: "mutation",
        getRawInput: async () => ({}),
        meta: undefined,
      });

      await expect(result).rejects.toThrow(TRPCError);
      await expect(result).rejects.toThrow("Cannot assign event to users outside of team membership");
    });

    it("should deny assigning only non-team members even if user has permission", async () => {
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(teamEvent);

      const procedure = createEventPbacProcedure("eventType.update");
      const middleware = getMiddleware(procedure);

      const result = middleware({
        ctx: mockCtx,
        input: { id: 2, users: [100, 200, 300] }, // All users not in team
        next: mockNext,
        path: "test",
        type: "mutation",
        getRawInput: async () => ({}),
        meta: undefined,
      });

      await expect(result).rejects.toThrow(TRPCError);
      await expect(result).rejects.toThrow("Cannot assign event to users outside of team membership");
    });

    it("should allow empty users array", async () => {
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(teamEvent);

      const procedure = createEventPbacProcedure("eventType.update");
      const middleware = getMiddleware(procedure);

      await expect(
        middleware({
          ctx: mockCtx,
          input: { id: 2, users: [] },
          next: mockNext,
          path: "test",
          type: "mutation",
          getRawInput: async () => ({}),
          meta: undefined,
        })
      ).resolves.not.toThrow();
    });

    it("should not validate users when not provided", async () => {
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(teamEvent);

      const procedure = createEventPbacProcedure("eventType.update");
      const middleware = getMiddleware(procedure);

      await expect(
        middleware({
          ctx: mockCtx,
          input: { id: 2 },
          next: mockNext,
          path: "test",
          type: "mutation",
          getRawInput: async () => ({}),
          meta: undefined,
        })
      ).resolves.not.toThrow();
    });
  });

  describe("event not found", () => {
    it("should throw NOT_FOUND when event does not exist", async () => {
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(null);

      const procedure = createEventPbacProcedure("eventType.update");
      const middleware = getMiddleware(procedure);

      const result = middleware({
        ctx: mockCtx,
        input: { id: 999 },
        next: mockNext,
        path: "test",
        type: "mutation",
        getRawInput: async () => ({}),
        meta: undefined,
      });

      await expect(result).rejects.toThrow(TRPCError);
      await expect(result).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("input validation", () => {
    it("should accept eventTypeId as alternative to id", async () => {
      const event = {
        id: 1,
        userId: 1,
        teamId: null,
        users: [{ id: 1 }],
        team: null,
      };
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(event);

      const procedure = createEventPbacProcedure("eventType.update");
      const middleware = getMiddleware(procedure);

      await expect(
        middleware({
          ctx: mockCtx,
          input: { eventTypeId: 1 },
          next: mockNext,
          path: "test",
          type: "mutation",
          getRawInput: async () => ({}),
          meta: undefined,
        })
      ).resolves.not.toThrow();

      expect(mockPrisma.eventType.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: expect.any(Object),
      });
    });
  });

  describe("different permissions and fallback roles", () => {
    const teamEvent = {
      id: 2,
      userId: null,
      teamId: 10,
      users: [],
      team: {
        members: [{ userId: 1 }],
      },
    };

    it("should allow access with custom permission string", async () => {
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(teamEvent);

      const procedure = createEventPbacProcedure("eventType.delete");
      const middleware = getMiddleware(procedure);

      await expect(
        middleware({
          ctx: mockCtx,
          input: { id: 2 },
          next: mockNext,
          path: "test",
          type: "mutation",
          getRawInput: async () => ({}),
          meta: undefined,
        })
      ).resolves.not.toThrow();
      expect(mockCheckPermission).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, teamId: 10, permission: "eventType.delete" })
      );
    });

    it("should allow access with custom fallback roles", async () => {
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(teamEvent);

      const procedure = createEventPbacProcedure("eventType.create", [MembershipRole.OWNER]);
      const middleware = getMiddleware(procedure);

      await expect(
        middleware({
          ctx: mockCtx,
          input: { id: 2 },
          next: mockNext,
          path: "test",
          type: "mutation",
          getRawInput: async () => ({}),
          meta: undefined,
        })
      ).resolves.not.toThrow();
      expect(mockCheckPermission).toHaveBeenCalledWith(
        expect.objectContaining({
          teamId: 10,
          permission: "eventType.create",
          fallbackRoles: [MembershipRole.OWNER],
        })
      );
    });

    it("should deny a team event when PermissionCheckService refuses", async () => {
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(teamEvent);
      mockCheckPermission.mockResolvedValue(false);

      const procedure = createEventPbacProcedure("eventType.delete");
      const middleware = getMiddleware(procedure);

      await expect(
        middleware({
          ctx: mockCtx,
          input: { id: 2 },
          next: mockNext,
          path: "test",
          type: "mutation",
          getRawInput: async () => ({}),
          meta: undefined,
        })
      ).rejects.toThrow("Permission required: eventType.delete");
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe("ensureEmailOrPhoneNumberIsPresent", () => {
    it("should throw error when both email and phone are hidden", () => {
      const fields = [
        {
          name: "email",
          type: "email" as const,
          required: true,
          hidden: true,
        },
        {
          name: "attendeePhoneNumber",
          type: "phone" as const,
          required: true,
          hidden: true,
        },
      ];

      expect(() => ensureEmailOrPhoneNumberIsPresent(fields)).toThrow(TRPCError);
      expect(() => ensureEmailOrPhoneNumberIsPresent(fields)).toThrow(
        expect.objectContaining({
          code: "BAD_REQUEST",
          message: "booking_fields_email_and_phone_both_hidden",
        })
      );
    });

    it("should throw error when neither email nor phone is required", () => {
      const fields = [
        {
          name: "email",
          type: "email" as const,
          required: false,
          hidden: false,
        },
        {
          name: "attendeePhoneNumber",
          type: "phone" as const,
          required: false,
          hidden: false,
        },
      ];

      expect(() => ensureEmailOrPhoneNumberIsPresent(fields)).toThrow(TRPCError);
      expect(() => ensureEmailOrPhoneNumberIsPresent(fields)).toThrow(
        expect.objectContaining({
          code: "BAD_REQUEST",
          message: "booking_fields_email_or_phone_required",
        })
      );
    });

    it("should throw error when email is hidden and phone is not required", () => {
      const fields = [
        {
          name: "email",
          type: "email" as const,
          required: true,
          hidden: true,
        },
        {
          name: "attendeePhoneNumber",
          type: "phone" as const,
          required: false,
          hidden: false,
        },
      ];

      expect(() => ensureEmailOrPhoneNumberIsPresent(fields)).toThrow(TRPCError);
      expect(() => ensureEmailOrPhoneNumberIsPresent(fields)).toThrow(
        expect.objectContaining({
          code: "BAD_REQUEST",
          message: "booking_fields_phone_required_when_email_hidden",
        })
      );
    });

    it("should throw error when phone is hidden and email is not required", () => {
      const fields = [
        {
          name: "email",
          type: "email" as const,
          required: false,
          hidden: false,
        },
        {
          name: "attendeePhoneNumber",
          type: "phone" as const,
          required: true,
          hidden: true,
        },
      ];

      expect(() => ensureEmailOrPhoneNumberIsPresent(fields)).toThrow(TRPCError);
      expect(() => ensureEmailOrPhoneNumberIsPresent(fields)).toThrow(
        expect.objectContaining({
          code: "BAD_REQUEST",
          message: "booking_fields_email_required_when_phone_hidden",
        })
      );
    });

    it("should pass when email is visible and required while phone is hidden", () => {
      const fields = [
        {
          name: "email",
          type: "email" as const,
          required: true,
          hidden: false,
        },
        {
          name: "attendeePhoneNumber",
          type: "phone" as const,
          required: false,
          hidden: true,
        },
      ];

      expect(() => ensureEmailOrPhoneNumberIsPresent(fields)).not.toThrow();
    });

    it("should pass when phone is visible and required while email is hidden", () => {
      const fields = [
        {
          name: "email",
          type: "email" as const,
          required: false,
          hidden: true,
        },
        {
          name: "attendeePhoneNumber",
          type: "phone" as const,
          required: true,
          hidden: false,
        },
      ];

      expect(() => ensureEmailOrPhoneNumberIsPresent(fields)).not.toThrow();
    });

    it("should pass when both email and phone are visible and required", () => {
      const fields = [
        {
          name: "email",
          type: "email" as const,
          required: true,
          hidden: false,
        },
        {
          name: "attendeePhoneNumber",
          type: "phone" as const,
          required: true,
          hidden: false,
        },
      ];

      expect(() => ensureEmailOrPhoneNumberIsPresent(fields)).not.toThrow();
    });
  });
});
